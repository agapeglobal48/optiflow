# OptiFlow — Foundation

Multi-tenant SaaS backend foundation for OptiFlow, built against the
"Coded SaaS Developer Build Specification" (v1.0, August 2026).

This is **phase 1**: auth, multi-tenancy, RBAC, and the core data model.
Business modules (customer import, campaigns, messaging, booking,
dashboard, super-admin) build on top of this in later phases.

## Stack

- **Backend**: Node.js + TypeScript, Express
- **Database**: PostgreSQL via Prisma ORM (versioned migrations)
- **Cache/Queue**: Redis + BullMQ (for campaign sends, webhook processing)
- **Auth**: JWT access tokens (15 min) + opaque, hashed, rotating refresh tokens
- **Password hashing**: argon2id

## What's built so far

### Phase 1 — Foundation
- Multi-tenant data model, JWT + rotating refresh token auth, permission-based RBAC, tenant isolation helpers, audit log

### Phase 2 — Practice Onboarding
- **Admin-created onboarding model**: OptiFlow's own team (super-admin) creates a new practice; nobody else self-signs-up.
- Creating a practice automatically sets up: a practice-scoped "Practice Admin" role (cloned from the system template), default `AiSettings` row, default feature flags, and an **invite** (not a pre-set password) for the practice owner.
- **Invite flow**: same opaque-hashed-token pattern as refresh tokens. The owner (or later, any staff member) receives a link, previews which practice/role they're joining, and sets their own password to activate the account. Nobody — not even a super-admin — sets another person's password directly.
- **Branch management**: full CRUD, tenant-scoped, soft-delete on removal.
- A "platform practice" (`isPlatform: true`) represents OptiFlow's internal org so super-admin users still satisfy the `User.practiceId` foreign key without a messy nullable-tenant special case.

### Endpoints added this phase
```
POST   /api/super-admin/practices           create a practice + owner invite   [superadmin:practices:manage]
GET    /api/super-admin/practices           list all practices                  [superadmin:practices:manage]
GET    /api/super-admin/practices/:id       practice detail + branches          [superadmin:practices:manage]
PATCH  /api/super-admin/practices/:id/status  change ACTIVE/SUSPENDED/CANCELLED [superadmin:practices:manage]

POST   /api/staff/invites                   invite a staff member                [staff:invite]
GET    /api/staff/invites                   list pending invites                 [staff:invite]
DELETE /api/staff/invites/:id               revoke an invite                     [staff:invite]

GET    /api/invites/:token                  preview invite (public, no auth)
POST   /api/invites/:token/accept           accept invite, set password (public, no auth)

GET    /api/branches                        list branches                        [branches:view]
GET    /api/branches/:id                    get one branch                       [branches:view]
POST   /api/branches                        create branch                        [branches:manage]
PATCH  /api/branches/:id                    update branch                        [branches:manage]
DELETE /api/branches/:id                    soft-delete branch                   [branches:manage]
```

### Phase 3 — Customer CSV Import
- **Upload endpoint** (`POST /api/customers/import`, multipart file) accepts a CSV export from any practice-management system.
- **Auto column mapping**: recognises common header variants (`First Name`/`first_name`/`Given Name`, `Mobile`/`Phone`/`Cell`, etc.) with no configuration needed; an explicit `mapping` field can override/extend detection for unusual exports.
- **Row-level validation, not all-or-nothing**: a row needs a first name and at least one contact method (mobile or email). Bad rows are skipped and reported — they never fail the whole import. An unparsable recall date is a *warning* (row still imports, date left blank), not an error.
- **Dedup via `externalId`**: re-uploading the same export updates existing customers instead of creating duplicates, using the schema's `@@unique([practiceId, externalId])` constraint.
- **Suppression check at import time**: any row matching an existing suppression-list entry (by mobile or email) is marked `OPTED_OUT` immediately, so reporting is accurate from the moment of import, not just at send time.
- **`ImportBatch`**: every import leaves a receipt — total rows, imported/updated/skipped counts, and a full list of per-row errors/warnings.
- **MVP limit**: 20,000 rows / 5MB per file, processed synchronously within the request. Larger files should move to a background job (BullMQ is already in the stack for this, just not wired up yet) — noted as a TODO in `importService.ts` rather than built prematurely.

```
POST   /api/customers/import                upload + process a CSV      [customers:import]
GET    /api/customers/import/batches        list past import batches    [customers:import]
GET    /api/customers/import/batches/:id    one batch's full detail     [customers:import]
GET    /api/customers                       list customers (paginated, searchable) [customers:view]
GET    /api/customers/:id                   get one customer            [customers:view]
```

### Phase 4 — Campaign Builder
- **Message templates**: reusable WhatsApp message content, tied to a provider-registered template name. `isApproved` is a placeholder until Phase 5's real WhatsApp integration sets it from an actual approval webhook rather than a manual PATCH.
- **Audience filter builder**: target customers by branch, recall-due-date range, and appointment type. `POST /api/campaigns/audience-preview` lets a caller check the matching count *before* creating a campaign. The filter always excludes soft-deleted and opted-out customers, regardless of what the caller specifies — this is enforced in `audienceFilter.ts`, not left to each caller to remember.
- **Draft → launch flow**: a campaign starts as a `DRAFT`. Launching it:
  1. Re-runs the audience query at launch time (not just when the campaign was created — a customer's recall date or consent status may have changed since)
  2. Re-checks the suppression list a **second time** (independent of the check at CSV import time — someone may have opted out since)
  3. Snapshots each eligible customer into an immutable `CampaignRecipient` row (`snapshotName`/`snapshotChannel`) so campaign history survives even if the underlying customer record later changes
  4. Queues one real BullMQ job per recipient on the `campaign-sends` Redis queue
- **No worker consumes the queue yet** — that's Phase 5, once the actual WhatsApp provider integration exists. Right now, launching a campaign visibly queues jobs in Redis (verifiable via Redis tooling) but nothing sends yet.
- **Pause/resume/stop**: status transitions are enforced (e.g. can't pause a campaign that isn't running). Known limitation, flagged in code: stopping a campaign doesn't yet remove already-queued Redis jobs — the Phase 5 worker needs to check campaign status before each send.

```
POST   /api/campaigns/audience-preview      dry-run: count + sample matching customers [campaigns:create]
POST   /api/campaigns                       create a draft campaign     [campaigns:create]
GET    /api/campaigns                       list campaigns              [campaigns:view]
GET    /api/campaigns/:id                   campaign detail             [campaigns:view]
GET    /api/campaigns/:id/recipients        list snapshot recipients    [campaigns:view]
POST   /api/campaigns/:id/launch            launch (snapshot + queue)   [campaigns:launch]
POST   /api/campaigns/:id/pause             pause a running campaign    [campaigns:pause_stop]
POST   /api/campaigns/:id/resume            resume a paused campaign    [campaigns:pause_stop]
POST   /api/campaigns/:id/stop              stop permanently            [campaigns:pause_stop]

GET    /api/message-templates               list templates              [campaigns:view]
GET    /api/message-templates/:id           get one template            [campaigns:view]
POST   /api/message-templates               create a template           [campaigns:create]
PATCH  /api/message-templates/:id           update a template           [campaigns:create]
```

### Phase 5 — WhatsApp Messaging & Webhooks
- **Provider abstraction**: nothing outside `providerFactory.ts` knows whether messages go to a real WhatsApp Business number or a local mock. `WHATSAPP_PROVIDER=mock` (the local dev default) simulates sending and logs what would have gone out — the entire pipeline runs end-to-end without a real WhatsApp Business API account. `WHATSAPP_PROVIDER=cloud_api` calls Meta's real Graph API directly; `WHATSAPP_PROVIDER=aisensy` calls [AiSensy](https://aisensy.com) (a WhatsApp BSP with a free tier — free API access, small free conversation credit, unlimited free service-window replies; outbound campaign/marketing messages cost ~₹1.09 each once free credit runs out, which is Meta's own pricing passed through, not an AiSensy markup). Both real providers are built to their documented request/response shapes but **have not been exercised against live accounts** — treat them as correct-per-docs, unverified in practice, until tested against real sandbox numbers.
  - **AiSensy webhook payload shape is an educated guess, not a verified fact** — flagged prominently in `webhooksRoutes.ts`. AiSensy's send API is precisely documented; their webhook payload format isn't publicly documented in detail. Evidence (their own blog on WhatsApp webhooks) suggests they use the same field vocabulary as Meta's native format, so the existing Meta-shaped parser is used as the best available assumption. **Once a real AiSensy account exists, compare a real webhook payload from their dashboard logs against `webhookPayloadParsing.ts` and adjust if it differs.**
- **A separate worker process** (`npm run worker`) consumes the `campaign-sends` Redis queue from Phase 4. This mirrors real BullMQ deployment: the API enqueues, one or more independent workers consume — they can be scaled separately in production.
- **Template rendering**: `{{name}}` and `{{firstName}}` are substituted from the recipient's immutable snapshot at send time — never re-fetched from the live Customer record.
- **Webhook handler** (`/webhooks/whatsapp`): handles Meta's GET verification handshake and POST event delivery. Real **HMAC-SHA256 signature verification** is enforced when `WHATSAPP_PROVIDER=cloud_api` (skipped in `mock` mode, since there's no real Meta App Secret to check against locally — manually-crafted test payloads via curl/Postman work without computing a real signature).
- **Dedup**: every webhook event is recorded in `WebhookEvent` keyed by a provider event ID before processing — Meta retries webhook delivery aggressively, and this guarantees processing the same event twice never double-applies it (verified in the integration test).
- **Tenant routing for webhooks**: each practice has its own `whatsappPhoneNumberId`. An inbound webhook's `metadata.phone_number_id` is how we resolve which practice it belongs to — there's no OptiFlow `practiceId` in Meta's payload. A defense-in-depth check also confirms any message being updated actually belongs to the resolved practice before touching it.
- **First-reply attribution**: an inbound message from a known customer automatically marks their most recent un-replied `CampaignRecipient` as replied — this is what powers the "X replied" metric in future reporting.
- **Known limitations, flagged in code rather than silently missing**:
  - An inbound message from a phone number that doesn't match any customer's `mobile` is currently dropped (logged, not stored) — a real implementation needs an "unknown contacts" holding area.
  - Stopping a campaign doesn't retract already-queued Redis jobs; the worker checks campaign status per-job, but a paused campaign's jobs rely on BullMQ's retry/backoff to eventually notice a resume, rather than being explicitly re-triggered.
  - Only plain-text inbound messages are parsed; other message types (images, documents, interactive replies) are ignored for MVP.
  - **Real campaign sends need WhatsApp message templates, not free text.** Both `CloudApiWhatsAppProvider` and `AiSensyProvider` currently send `type: "text"` (free-form). WhatsApp only allows free text within an active 24-hour customer-service window (replying to someone who messaged first) — a business-initiated recall campaign is outside that window and legally must use an approved message *template* with structured parameters instead, or the real provider will reject it. `MessageTemplate` currently only stores a human-readable `bodyPreview`, not the positional parameter structure WhatsApp's template API needs. This is the next real gap to close before either real provider can send genuine outside-window campaign messages — flagged in both provider files rather than silently sending the wrong request shape.

```
POST   /webhooks/whatsapp                   Meta webhook receiver (public, HMAC-verified in cloud_api mode)
GET    /webhooks/whatsapp                   Meta subscription verification handshake (public)

GET    /api/conversations                   list conversations          [inbox:view]
GET    /api/conversations/:id               conversation detail + messages [inbox:view]
```

### Phase 6 — AI Conversation Engine
- **Provider abstraction**: same principle as WhatsApp providers. `AI_PROVIDER=mock` (default) is deterministic and free — no API key needed, good enough to exercise the whole guardrail pipeline. `AI_PROVIDER=anthropic` calls Claude's real Messages API directly via `fetch` (no SDK dependency).
- **Guardrails are layered and mostly deterministic, not just prompt instructions:**
  1. **Kill switch** — checked first, before any AI call: practice-wide (`AiSettings.autoSendEnabled`) and per-conversation (`Conversation.aiAutoSendPaused`), independently controllable.
  2. **Deterministic blocklist** (`safetyGuardrails.ts`) — a baseline set of clinical/emergency terms is *always* active regardless of practice configuration (a practice leaving their own list empty can never accidentally disable this), plus practice-configurable custom terms. Runs in plain code, before the AI is ever called.
  3. **Structured, validated response parsing** (`aiResponseParsing.ts`) — the model must return JSON matching a strict shape; anything malformed, unparseable, or missing a required field on a non-escalating response safely falls back to `escalate: true`. A broken/hallucinated response can never accidentally auto-send.
  4. **Confidence threshold** — the model self-reports its own confidence; below the practice's configured threshold (`AiSettings.confidenceThreshold`, default 0.75), it escalates instead of auto-sending.
- **Full traceability**: every AI-sent message populates `Message.aiModel`, `aiPromptVersion`, and `aiConfidence` — these fields existed in the schema since Phase 1, unused until now.
- **Knowledge base** (`KnowledgeEntry`): the model is instructed to answer *only* from facts a practice has entered here — never invent prices, availability, or hours.
- **Versioned prompts**: `PROMPT_VERSION` in `promptBuilder.ts` is a plain string constant, bumped whenever the prompt text changes meaningfully, so every message can be traced to exactly which prompt produced it.
- **Wired into the real inbound webhook flow** from Phase 5 — replaces the previous hardcoded "always escalate to human" placeholder.

```
GET    /api/knowledge-base                  list FAQ entries            [ai:configure]
POST   /api/knowledge-base                  add an entry                [ai:configure]
PATCH  /api/knowledge-base/:id              update an entry             [ai:configure]
DELETE /api/knowledge-base/:id              remove an entry             [ai:configure]

GET    /api/ai-settings                     view AI settings            [ai:configure]
PATCH  /api/ai-settings                     update threshold/blocklist/prompt version [ai:configure]
POST   /api/ai-settings/kill-switch         practice-wide AI on/off     [ai:kill_switch]

POST   /api/conversations/:id/ai-pause      pause AI for one conversation [ai:kill_switch]
POST   /api/conversations/:id/ai-resume     resume AI for one conversation [ai:kill_switch]
```

### Phase 7 — Human Inbox
- **Queue views**: `GET /api/conversations?status=HUMAN_QUEUE` (or any status) filters into a specific queue — AI-handling, human-queue, human-handling, waiting-on-customer, closed.
- **Take-over / release-to-AI**: a staff member can take full ownership of a conversation (assigns themselves, pauses AI, marks `HUMAN_HANDLING`) or release it back to AI (unassigns, resumes AI, marks `AI_HANDLING`). This is broader than the Phase 6 AI-pause/resume pair — it also handles ownership/assignment, not just the AI on/off toggle. Both mechanisms coexist deliberately: AI-pause/resume is a quick "just mute AI" action; take-over/release is the full ownership workflow.
- **Sending a reply is itself an implicit take-over** — a staff member actively typing to a customer means they're handling this conversation right now, so `POST /api/conversations/:id/messages` also assigns them and marks `HUMAN_HANDLING` in the same call, rather than requiring two separate API calls.
- **Internal notes**: the same send-message endpoint supports `isInternalNote: true` — a staff-only note (e.g. "called patient, no answer") that's saved to the thread but never sent to the customer, and never touches the WhatsApp provider at all.
- **Viewing a conversation marks it read**: `GET /api/conversations/:id` resets `unreadCount` to 0 as a natural side effect of opening the thread, rather than requiring a separate "mark as read" call.
- **Known MVP limitation, flagged in code**: take-over always self-assigns the calling staff member. A supervisor explicitly reassigning a conversation to a *different* staff member isn't built yet.

```
POST   /api/conversations/:id/take-over     assign self, pause AI, HUMAN_HANDLING [inbox:take_over]
POST   /api/conversations/:id/release-to-ai unassign, resume AI, AI_HANDLING       [inbox:release_to_ai]
POST   /api/conversations/:id/close         mark conversation CLOSED              [inbox:take_over]
POST   /api/conversations/:id/messages      send a reply (or internal note)       [inbox:send_message]
```

### Phase 8 — Booking
- **Availability is computed, not pre-created.** There's no table of "open slots" to maintain — `GET /api/bookings/availability` reads a branch's `workingHours` (Json on `Branch`, e.g. `{"mon":[{"open":"09:00","close":"17:00"}], ...}`) and its already-booked appointments for the window, and generates bookable slots on the fly (`slotComputation.ts`, 30-minute default). That pure computation has no DB dependency at all and is fully unit tested (`src/__tests__/availabilityService.test.ts`) independent of the DB-backed wrapper in `availabilityService.ts`.
- **Double-booking prevention, two layers:**
  1. An explicit overlap query before insert (`startTime < requestedEnd && endTime > requestedStart`) — catches the normal case with a clean `409` and message.
  2. The DB-level `@@unique([branchId, startTime, source])` constraint on `Appointment` (present in the schema since Phase 1) as a last-resort guard against a race between two concurrent requests for the same slot — caught and turned into the same `409`.
- **Booking from a conversation**: `POST /api/bookings` accepts an optional `conversationId`. When present, the conversation is marked `BOOKED` and a WhatsApp confirmation message is sent and recorded (`sender: SYSTEM`, distinct from `AI`/`STAFF` messages so it's clear in the thread this was an automatic booking confirmation, not a reply from either). The provider send is best-effort — a failed confirmation message never rolls back the booking itself, it's just logged for staff follow-up.
- **MVP design decision — UTC only**: working-hours times are plain `"HH:mm"` 24-hour strings interpreted as UTC. `Practice.timezone` already exists in the schema (used elsewhere for display) but full IANA-timezone-aware slot computation (DST, per-branch local time) is out of scope for this phase — a practice outside UTC should enter working hours already converted to UTC for now. Documented in `workingHours.ts`.
- **External calendar sync is a stub, not a real integration** (`externalCalendarSync.ts`) — `Appointment.source`/`externalRef` exist in the schema for this purpose, and the seam (`ExternalCalendarProvider` interface + a no-op implementation) is in place, but no Google/Outlook OAuth or event sync is built. `syncBooking()` always returns `null`, so every booking stays `source: "internal"` with no `externalRef` until a real provider is wired in.
- **Known MVP limitation**: there's no per-`appointmentType` slot duration yet — every booking uses the same default 30-minute slot unless a caller passes an explicit `endTime`.

```
GET    /api/bookings/availability?branchId=&date=YYYY-MM-DD&days=&slotMinutes=   list open slots [bookings:view]
GET    /api/bookings?branchId=&customerId=&status=&from=&to=                     list bookings   [bookings:view]
GET    /api/bookings/:id                                                         get one booking [bookings:view]
POST   /api/bookings                                                             create a booking [bookings:create]
PATCH  /api/bookings/:id/cancel                                                  cancel a booking [bookings:cancel]
PATCH  /api/bookings/:id/status        { "status": "COMPLETED" | "NO_SHOW" }     [bookings:cancel]
```

**Phase 8 addendum (shipped with Phase 9):** `CampaignRecipient` already had a full funnel in its schema since Phase 4 (`queued → sent → delivered → replied → booked`, with a `bookedAt` timestamp) but nothing ever set the `booked` step. `createBooking` now does this — `attributeBookingToCampaign()` in `bookingService.ts` marks the matching recipient booked, either from an explicit `campaignId` on the booking request or, when omitted, by inferring the customer's most recent replied-but-unbooked campaign send (the same inference `webhookService.ts` already uses for reply attribution). This is what makes Phase 9's campaign performance/revenue numbers real instead of always zero.

### Phase 9 — Dashboard & Reporting
- **Practice overview** (`GET /api/reports/overview`): the single "how's revenue recovery going" snapshot — customer/recall counts, messages sent split by AI vs staff (with an AI-automation-share ratio), conversations by status, bookings by status with a no-show rate, and an estimated-revenue-recovered figure (bookings that weren't cancelled/no-show × the practice's `defaultAppointmentValue`). Optional `?from=&to=` ISO-datetime range filters the activity counts.
- **Campaign performance** (`GET /api/reports/campaigns`, `GET /api/reports/campaigns/:id`): per-campaign funnel (recipients → sent → delivered → replied → booked) with reply-rate and booking-rate conversions, plus estimated revenue attributed to that specific campaign. This is the direct "did this WhatsApp campaign pay for itself" number the whole product exists to answer.
- **CSV export** (`GET /api/reports/campaigns/export.csv`, `[reports:export]`): the same campaign performance data as a downloadable CSV, for a practice owner who wants it in a spreadsheet. Hand-rolled CSV serialization (`csvBuilder.ts`) rather than a new dependency — this codebase already carries `csv-parse` for CSV *import* (Phase 3); export is simple enough not to justify a second CSV library and its own advisory surface to track.
- **Bookings breakdown** (`GET /api/reports/bookings?branchId=&from=&to=`): appointment counts by status, grouped by branch.
- **Revenue estimate is explicitly an estimate**, not real billing data (`Practice.defaultAppointmentValue` is a plain configured average, set at onboarding) — it returns `null`, not `£0`, when a practice hasn't configured a value, so a dashboard can show "not configured" rather than a misleadingly precise zero.
- **All the underlying math is pure and unit tested independent of the database** (`reportMath.ts`, `csvBuilder.ts` — see `src/__tests__/reportMath.test.ts` and `csvBuilder.test.ts`), same separation as the Phase 8 availability engine.

```
GET    /api/reports/overview?from=&to=              practice-wide KPI snapshot        [reports:view]
GET    /api/reports/campaigns                        performance for every campaign    [reports:view]
GET    /api/reports/campaigns/:id                     performance for one campaign      [reports:view]
GET    /api/reports/campaigns/export.csv               campaign performance as CSV       [reports:export]
GET    /api/reports/bookings?branchId=&from=&to=      booking counts by branch/status   [reports:view]
```

### Phase 10 — Super-Admin Portal
- **Three distinct superadmin permissions, not one blanket check.** Phase 2 originally gated every `/api/super-admin/*` route behind a single `SUPERADMIN_PRACTICES_MANAGE` check. That was fine when practice CRUD was the only thing here, but a real support team needs a narrower role: someone who can look at a practice's numbers to help a customer shouldn't automatically also be able to suspend the practice or flip its feature flags. Each route in `superAdminRoutes.ts` now declares its own permission out of `practices:manage`, `support:access`, or `system:health` — all three already existed in the permission catalogue since Phase 1/RBAC design, just unused until now.
- **Support access is logged, not silent.** `GET /api/super-admin/practices/:id/support-summary` gives a read-only cross-tenant snapshot (staff/branch/customer counts, active campaigns, open conversations, AI settings) without needing to "log in as" the practice — and every call writes an `AuditLog` row (`action: "superadmin.support_access"`) into *that practice's own* audit trail, so a practice owner can see when platform staff looked at their account, not just that platform staff technically could.
- **Feature flags** (`PracticeFeatureFlag`, seeded with defaults at onboarding since Phase 2 but never exposed via API until now) are now manageable per practice — `external_calendar_sync` is one of the three defaults, which lines up with Phase 8's booking module shipping that as a documented stub rather than a real integration; flipping this flag on is the natural place a future real integration would gate itself.
- **System health** (`GET /api/super-admin/system-health`) is an operational snapshot, not business reporting — practice counts by status, failed/dead-lettered webhook events, failed message sends, the campaign-send queue's live job counts (waiting/active/completed/failed/delayed), and how many practices currently have their AI auto-send kill switch off. Deliberately separate from Phase 9's `/api/reports/*`, which is practice-scoped business metrics (revenue, campaign performance) rather than "is anything broken right now".
- **This is genuinely the only part of the codebase allowed to query across `practiceId` values** — every other module goes through `withTenant()`/`assertSameTenant()` (`lib/tenantGuard.ts`). `platformService.ts` carries a comment flagging this explicitly so it doesn't get treated as a pattern to copy elsewhere.

```
POST   /api/super-admin/practices                                create a practice + owner invite  [superadmin:practices:manage]
GET    /api/super-admin/practices                                list all practices                [superadmin:practices:manage]
GET    /api/super-admin/practices/:id                             get one practice                  [superadmin:practices:manage]
PATCH  /api/super-admin/practices/:id/status                      ACTIVE / SUSPENDED / CANCELLED    [superadmin:practices:manage]
GET    /api/super-admin/practices/:id/feature-flags               list a practice's feature flags   [superadmin:practices:manage]
PATCH  /api/super-admin/practices/:id/feature-flags/:key           { "enabled": true|false }         [superadmin:practices:manage]
GET    /api/super-admin/practices/:id/support-summary              cross-tenant read-only summary    [superadmin:support:access]
GET    /api/super-admin/system-health                             platform operational snapshot     [superadmin:system:health]
```


## Running locally

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Install deps
cd apps/api
npm install

# 3. Configure environment
cp .env.example .env
# generate real secrets:
openssl rand -base64 48   # → JWT_ACCESS_SECRET
openssl rand -base64 48   # → JWT_REFRESH_SECRET

# 4. Run migrations + seed
npm run prisma:migrate   # name it after the phase you're on, e.g. "phase9_reporting"
npx tsx prisma/seed.ts

# 5. Start the API
npm run dev
```

In a separate terminal, start the campaign-send worker (needed for Phase 4/5
campaign launches to actually process — the API alone only queues jobs):
```bash
cd apps/api
npm run worker
```

The seed script creates:
- Demo practice admin: `admin@demo-optical.test` / `DemoPassword123!`
- Platform super-admin: `superadmin@optiflow.test` / `SuperAdminPass123!`

## Testing

```bash
npm run test:unit          # pure logic, no database needed
npm run test:integration   # requires DATABASE_URL + migrations applied + Redis
npm test                   # both
```

Unit tests cover the tenant-isolation helper, password service, invite
tokens, CSV parsing/mapping/validation, the audience filter builder, and
the AI engine's pure logic (response parsing, safety blocklist, prompt
building). The integration suite proves — with a real database — that
branches, imported customers, suppression checks, campaign launches, the
messaging pipeline (send, webhook dedup, inbound replies), the AI
conversation engine's guardrails and kill switches, the human inbox
(take-over, release, replies, internal notes), bookings (availability,
double-booking prevention, conversation-linked confirmations, campaign
attribution), reporting (overview KPIs, campaign performance, bookings
breakdown), and the super-admin platform operations (system health, support
summaries, feature flags) all correctly respect tenant isolation (or, for
the super-admin module, correctly *cross* it only through a superadmin
permission). **As each new business module is added, it needs a
matching integration test.** This is a hard requirement from the build
spec (section 14), not optional coverage.

## What's next

In spec order, the next modules to build are:
1. ~~Practice onboarding + branch management (4.1, 5.2)~~ ✅ done
2. ~~Customer CSV import with validation/dedup (5.3)~~ ✅ done
3. ~~Campaign builder (5.4)~~ ✅ done
4. ~~WhatsApp messaging integration + webhook handling (5.5, 8.2)~~ ✅ done
5. ~~AI conversation engine with guardrails (5.6, 11)~~ ✅ done
6. ~~Human inbox with take-over/release (5.7)~~ ✅ done
7. ~~Booking adapter (5.8)~~ ✅ done
8. ~~Dashboard & reporting (5.9)~~ ✅ done
9. ~~Super-admin portal (5.10)~~ ✅ done

All 10 backend phases are now complete. Frontend work starts from here, on a stable API surface.

## A note on this environment

The sandbox this project is built in cannot reach Prisma's engine-binary
host, so `prisma generate` can't fully complete there — the generated
client stays a placeholder. That's expected and doesn't affect you: running
`npm install` (which runs `prisma generate` as part of its postinstall) on
your own machine with normal internet access pulls the real engine binary
with no changes needed, exactly as it has for every phase so far. Because
of this, each phase's database-touching code is verified in the sandbox via
TypeScript's type checker and the full pure-logic unit test suite, and then
verified for real together via `npm run test:integration` and Postman once
it's running on your machine — that live pass is still required before a
phase is considered done.
