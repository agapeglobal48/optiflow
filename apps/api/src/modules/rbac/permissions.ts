// Fixed catalogue of permission keys. RBAC is permission-based rather than
// hard-coded by role name (build spec section 3): roles are just named
// bundles of these keys, configurable per practice, so a new role profile
// (e.g. "Regional Manager") can be created later via data, not code.
//
// Naming convention: "<resource>:<action>"

export const PERMISSIONS = {
  // Practice & staff management
  PRACTICE_MANAGE: "practice:manage",
  STAFF_INVITE: "staff:invite",
  STAFF_MANAGE_ROLES: "staff:manage_roles",
  BRANCHES_VIEW: "branches:view",
  BRANCHES_MANAGE: "branches:manage",

  // Customers
  CUSTOMERS_VIEW: "customers:view",
  CUSTOMERS_IMPORT: "customers:import",
  CUSTOMERS_EXPORT: "customers:export",
  CUSTOMERS_EDIT: "customers:edit",

  // Campaigns
  CAMPAIGNS_VIEW: "campaigns:view",
  CAMPAIGNS_CREATE: "campaigns:create",
  CAMPAIGNS_LAUNCH: "campaigns:launch",
  CAMPAIGNS_PAUSE_STOP: "campaigns:pause_stop",

  // Conversations / inbox
  INBOX_VIEW: "inbox:view",
  INBOX_TAKE_OVER: "inbox:take_over",
  INBOX_RELEASE_TO_AI: "inbox:release_to_ai",
  INBOX_SEND_MESSAGE: "inbox:send_message",

  // AI controls
  AI_CONFIGURE: "ai:configure",
  AI_KILL_SWITCH: "ai:kill_switch",

  // Booking
  BOOKINGS_VIEW: "bookings:view",
  BOOKINGS_CREATE: "bookings:create",
  BOOKINGS_CANCEL: "bookings:cancel",

  // Reporting
  REPORTS_VIEW: "reports:view",
  REPORTS_EXPORT: "reports:export",

  // Super admin (cross-tenant - must never be grantable via a practice-scoped role)
  SUPERADMIN_PRACTICES_MANAGE: "superadmin:practices:manage",
  SUPERADMIN_SUPPORT_ACCESS: "superadmin:support:access",
  SUPERADMIN_SYSTEM_HEALTH: "superadmin:system:health",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: { key: PermissionKey; description: string }[] = [
  { key: PERMISSIONS.PRACTICE_MANAGE, description: "Manage practice profile, branches and settings" },
  { key: PERMISSIONS.STAFF_INVITE, description: "Invite new staff users" },
  { key: PERMISSIONS.STAFF_MANAGE_ROLES, description: "Assign/change staff roles" },
  { key: PERMISSIONS.BRANCHES_VIEW, description: "View branch locations" },
  { key: PERMISSIONS.BRANCHES_MANAGE, description: "Create, edit, or close branch locations" },
  { key: PERMISSIONS.CUSTOMERS_VIEW, description: "View customer/recall records" },
  { key: PERMISSIONS.CUSTOMERS_IMPORT, description: "Import customer/recall CSV data" },
  { key: PERMISSIONS.CUSTOMERS_EXPORT, description: "Export customer data" },
  { key: PERMISSIONS.CUSTOMERS_EDIT, description: "Edit customer records" },
  { key: PERMISSIONS.CAMPAIGNS_VIEW, description: "View campaigns" },
  { key: PERMISSIONS.CAMPAIGNS_CREATE, description: "Create/edit draft campaigns" },
  { key: PERMISSIONS.CAMPAIGNS_LAUNCH, description: "Launch or schedule a campaign" },
  { key: PERMISSIONS.CAMPAIGNS_PAUSE_STOP, description: "Pause or stop a running campaign" },
  { key: PERMISSIONS.INBOX_VIEW, description: "View conversation inbox" },
  { key: PERMISSIONS.INBOX_TAKE_OVER, description: "Take over a conversation from AI" },
  { key: PERMISSIONS.INBOX_RELEASE_TO_AI, description: "Release a conversation back to AI" },
  { key: PERMISSIONS.INBOX_SEND_MESSAGE, description: "Send manual replies to customers" },
  { key: PERMISSIONS.AI_CONFIGURE, description: "Configure AI thresholds, blocklists, prompt version" },
  { key: PERMISSIONS.AI_KILL_SWITCH, description: "Enable/disable AI auto-send globally for the practice" },
  { key: PERMISSIONS.BOOKINGS_VIEW, description: "View appointment bookings" },
  { key: PERMISSIONS.BOOKINGS_CREATE, description: "Create appointment bookings" },
  { key: PERMISSIONS.BOOKINGS_CANCEL, description: "Cancel/rebook appointments" },
  { key: PERMISSIONS.REPORTS_VIEW, description: "View dashboard and reports" },
  { key: PERMISSIONS.REPORTS_EXPORT, description: "Export report data as CSV" },
  { key: PERMISSIONS.SUPERADMIN_PRACTICES_MANAGE, description: "Manage all practices (OptiFlow staff only)" },
  { key: PERMISSIONS.SUPERADMIN_SUPPORT_ACCESS, description: "Permissioned, logged support access to any practice" },
  { key: PERMISSIONS.SUPERADMIN_SYSTEM_HEALTH, description: "View system health and provider error dashboards" },
];

// Baseline system role templates (spec 4.1 onboarding + section 3).
// Practices can clone/customise these later without code changes.
export const SYSTEM_ROLE_TEMPLATES = {
  PRACTICE_ADMIN: {
    name: "Practice Admin",
    permissions: [
      PERMISSIONS.PRACTICE_MANAGE,
      PERMISSIONS.STAFF_INVITE,
      PERMISSIONS.STAFF_MANAGE_ROLES,
      PERMISSIONS.BRANCHES_VIEW,
      PERMISSIONS.BRANCHES_MANAGE,
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CUSTOMERS_IMPORT,
      PERMISSIONS.CUSTOMERS_EXPORT,
      PERMISSIONS.CUSTOMERS_EDIT,
      PERMISSIONS.CAMPAIGNS_VIEW,
      PERMISSIONS.CAMPAIGNS_CREATE,
      PERMISSIONS.CAMPAIGNS_LAUNCH,
      PERMISSIONS.CAMPAIGNS_PAUSE_STOP,
      PERMISSIONS.INBOX_VIEW,
      PERMISSIONS.INBOX_TAKE_OVER,
      PERMISSIONS.INBOX_RELEASE_TO_AI,
      PERMISSIONS.INBOX_SEND_MESSAGE,
      PERMISSIONS.AI_CONFIGURE,
      PERMISSIONS.AI_KILL_SWITCH,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_CREATE,
      PERMISSIONS.BOOKINGS_CANCEL,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  FRONT_DESK: {
    name: "Front Desk",
    permissions: [
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.BRANCHES_VIEW,
      PERMISSIONS.INBOX_VIEW,
      PERMISSIONS.INBOX_TAKE_OVER,
      PERMISSIONS.INBOX_RELEASE_TO_AI,
      PERMISSIONS.INBOX_SEND_MESSAGE,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_CREATE,
      PERMISSIONS.BOOKINGS_CANCEL,
    ],
  },
  MARKETING: {
    name: "Marketing",
    permissions: [
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CAMPAIGNS_VIEW,
      PERMISSIONS.CAMPAIGNS_CREATE,
      PERMISSIONS.CAMPAIGNS_LAUNCH,
      PERMISSIONS.CAMPAIGNS_PAUSE_STOP,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  SUPER_ADMIN: {
    name: "Super Admin",
    permissions: [
      PERMISSIONS.SUPERADMIN_PRACTICES_MANAGE,
      PERMISSIONS.SUPERADMIN_SUPPORT_ACCESS,
      PERMISSIONS.SUPERADMIN_SYSTEM_HEALTH,
    ],
  },
} as const;
