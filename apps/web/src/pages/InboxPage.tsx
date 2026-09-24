import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { AxiosError } from "axios";
import { Bot, Settings, UserCheck, UserX, CheckCircle2, Pause, Play, Send } from "lucide-react";
import {
  fetchConversations,
  fetchConversation,
  takeOverConversation,
  releaseToAi,
  pauseAiForConversation,
  resumeAiForConversation,
  closeConversation,
  sendMessage,
} from "@/lib/conversations";
import { useAuth } from "@/lib/authContext";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { AiSettingsDialog } from "@/components/AiSettingsDialog";
import type { ConversationStatus } from "@/types/conversation";

const STATUS_TONE: Record<ConversationStatus, "default" | "good" | "warning" | "critical"> = {
  AI_HANDLING: "default",
  WAITING_ON_CUSTOMER: "default",
  HUMAN_QUEUE: "warning",
  HUMAN_HANDLING: "good",
  BOOKED: "good",
  CLOSED: "default",
};

const STATUS_LABEL: Record<ConversationStatus, string> = {
  AI_HANDLING: "AI handling",
  WAITING_ON_CUSTOMER: "Waiting on customer",
  HUMAN_QUEUE: "Human queue",
  HUMAN_HANDLING: "Human handling",
  BOOKED: "Booked",
  CLOSED: "Closed",
};

const STATUS_FILTERS: { value: ConversationStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "AI_HANDLING", label: "AI handling" },
  { value: "HUMAN_QUEUE", label: "Human queue" },
  { value: "HUMAN_HANDLING", label: "Human handling" },
  { value: "WAITING_ON_CUSTOMER", label: "Waiting" },
  { value: "BOOKED", label: "Booked" },
  { value: "CLOSED", label: "Closed" },
];

function customerName(c: { firstName: string; lastName: string | null }): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

export function InboxPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("id");
  const statusFilter = (searchParams.get("status") ?? "") as ConversationStatus | "";
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // "list" / "detail" markers keep these two query keys structurally
  // distinct even when statusFilter and selectedId are both empty/null -
  // otherwise they'd collide on ["conversations", null] and the detail
  // query would silently read back the list's array as its data.
  const listQuery = useQuery({
    queryKey: ["conversations", "list", statusFilter || null],
    queryFn: () => fetchConversations(statusFilter || undefined),
    refetchInterval: 10_000,
  });

  const detailQuery = useQuery({
    queryKey: ["conversations", "detail", selectedId],
    queryFn: () => fetchConversation(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [detailQuery.data?.messages.length]);

  function selectConversation(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("id", id);
      return next;
    });
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }
  function onActionError(err: unknown) {
    if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
      setActionError(err.response.data.error.message);
    } else {
      setActionError("That action failed. Please try again.");
    }
  }

  const takeOverMutation = useMutation({ mutationFn: takeOverConversation, onSuccess: invalidate, onError: onActionError });
  const releaseMutation = useMutation({ mutationFn: releaseToAi, onSuccess: invalidate, onError: onActionError });
  const pauseAiMutation = useMutation({ mutationFn: pauseAiForConversation, onSuccess: invalidate, onError: onActionError });
  const resumeAiMutation = useMutation({ mutationFn: resumeAiForConversation, onSuccess: invalidate, onError: onActionError });
  const closeMutation = useMutation({ mutationFn: closeConversation, onSuccess: invalidate, onError: onActionError });

  const sendMutation = useMutation({
    mutationFn: (input: { body: string; isInternalNote: boolean }) => sendMessage(selectedId!, input),
    onSuccess: () => {
      setDraft("");
      setIsInternalNote(false);
      invalidate();
    },
    onError: onActionError,
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    if (!selectedId || draft.trim() === "") return;
    sendMutation.mutate({ body: draft.trim(), isInternalNote });
  }

  const conversation = detailQuery.data;
  const isActionPending =
    takeOverMutation.isPending || releaseMutation.isPending || pauseAiMutation.isPending || resumeAiMutation.isPending;

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-900">Inbox</h1>
          {(hasPermission("ai:configure") || hasPermission("ai:kill_switch")) && (
            <button
              onClick={() => setAiSettingsOpen(true)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="AI settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) =>
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (e.target.value) next.set("status", e.target.value);
              else next.delete("status");
              return next;
            })
          }
          className="m-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <div className="flex-1 overflow-y-auto">
          {listQuery.isLoading && <p className="p-4 text-sm text-slate-400">Loading&hellip;</p>}
          {listQuery.isError && <p className="p-4 text-sm text-red-600">Could not load conversations.</p>}
          {listQuery.data?.length === 0 && <p className="p-4 text-sm text-slate-400">No conversations here.</p>}
          {listQuery.data?.map((c) => (
            <button
              key={c.id}
              onClick={() => selectConversation(c.id)}
              className={
                "flex w-full flex-col gap-1 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 " +
                (c.id === selectedId ? "bg-indigo-50" : "")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-slate-900">{customerName(c.customer)}</span>
                {c.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1 text-xs font-semibold text-white">
                    {c.unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                <span className="shrink-0 text-xs text-slate-400">{formatDateTime(c.lastMessageAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation detail */}
      <div className="flex flex-1 flex-col bg-slate-50">
        {!selectedId && (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Select a conversation to view it
          </div>
        )}

        {selectedId && detailQuery.isLoading && (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading conversation&hellip;</div>
        )}

        {selectedId && conversation && (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{customerName(conversation.customer)}</h2>
                  <Badge tone={STATUS_TONE[conversation.status]}>{STATUS_LABEL[conversation.status]}</Badge>
                  {conversation.aiAutoSendPaused && conversation.status !== "CLOSED" && (
                    <Badge tone="warning">AI paused</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">{conversation.customer.mobile ?? conversation.customer.email}</p>
              </div>

              <div className="flex gap-2">
                {hasPermission("ai:kill_switch") && conversation.status !== "CLOSED" && (
                  <button
                    onClick={() =>
                      conversation.aiAutoSendPaused
                        ? resumeAiMutation.mutate(conversation.id)
                        : pauseAiMutation.mutate(conversation.id)
                    }
                    disabled={isActionPending}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {conversation.aiAutoSendPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    {conversation.aiAutoSendPaused ? "Resume AI" : "Pause AI"}
                  </button>
                )}
                {hasPermission("inbox:take_over") && conversation.status !== "HUMAN_HANDLING" && conversation.status !== "CLOSED" && (
                  <button
                    onClick={() => takeOverMutation.mutate(conversation.id)}
                    disabled={isActionPending}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Take over
                  </button>
                )}
                {hasPermission("inbox:release_to_ai") && conversation.status === "HUMAN_HANDLING" && (
                  <button
                    onClick={() => releaseMutation.mutate(conversation.id)}
                    disabled={isActionPending}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    Release to AI
                  </button>
                )}
                {hasPermission("inbox:take_over") && conversation.status !== "CLOSED" && (
                  <button
                    onClick={() => closeMutation.mutate(conversation.id)}
                    disabled={isActionPending}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UserX className="h-3.5 w-3.5" />
                    Close
                  </button>
                )}
              </div>
            </div>

            {actionError && <p className="border-b border-slate-200 bg-red-50 px-5 py-2 text-sm text-red-700">{actionError}</p>}

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {conversation.messages.length === 0 && (
                <p className="text-sm text-slate-400">No messages yet.</p>
              )}
              {conversation.messages.map((m) => {
                const isCustomer = m.direction === "INBOUND";
                if (m.isInternalNote) {
                  return (
                    <div key={m.id} className="mx-auto max-w-md rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <span className="font-semibold">Internal note</span> · {m.body}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={"flex " + (isCustomer ? "justify-start" : "justify-end")}>
                    <div
                      className={
                        "max-w-md rounded-xl px-3 py-2 text-sm shadow-sm " +
                        (isCustomer ? "bg-white text-slate-900" : "bg-indigo-600 text-white")
                      }
                    >
                      {!isCustomer && (
                        <p className={"mb-0.5 text-xs font-medium " + (m.sender === "AI" ? "text-indigo-200" : "text-indigo-100")}>
                          {m.sender === "AI" ? "AI" : m.sender === "STAFF" ? "Staff" : "System"}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className={"mt-1 text-right text-xs " + (isCustomer ? "text-slate-400" : "text-indigo-200")}>
                        {formatDateTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            {hasPermission("inbox:send_message") && conversation.status !== "CLOSED" ? (
              <form onSubmit={handleSend} className="border-t border-slate-200 bg-white px-5 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                    rows={2}
                    placeholder={isInternalNote ? "Add an internal note (not sent to the customer)…" : "Type a reply…"}
                    className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={draft.trim() === "" || sendMutation.isPending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Internal note (not sent to the customer)
                </label>
              </form>
            ) : (
              conversation.status === "CLOSED" && (
                <div className="flex items-center justify-center gap-1.5 border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-400">
                  <CheckCircle2 className="h-4 w-4" />
                  This conversation is closed
                </div>
              )
            )}
          </>
        )}
      </div>

      {aiSettingsOpen && <AiSettingsDialog onClose={() => setAiSettingsOpen(false)} />}
    </div>
  );
}
