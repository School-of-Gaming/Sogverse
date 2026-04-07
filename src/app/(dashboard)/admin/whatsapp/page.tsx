"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCheck, Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getClient } from "@/lib/supabase/client";
import {
  useWhatsAppContacts,
  useWhatsAppMessages,
  useSendWhatsAppMessage,
  whatsappKeys,
} from "@/services/whatsapp";
import { useQueryClient } from "@tanstack/react-query";
import type { WhatsAppContact, WhatsAppMessage } from "@/types";

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString();
}

function groupMessagesByDate(messages: WhatsAppMessage[]) {
  const groups: { date: string; messages: WhatsAppMessage[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const date = formatDate(msg.created_at);
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ date, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }

  return groups;
}

// --- Contact List ---

function ContactList({
  contacts,
  selectedPhone,
  onSelect,
  searchQuery,
  onSearchChange,
}: {
  contacts: WhatsAppContact[];
  selectedPhone: string | null;
  onSelect: (phone: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  const filtered = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.phone.includes(q) ||
      (c.wa_name && c.wa_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="border-b border-border p-3">
        <Input
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No conversations yet</p>
        )}
        {filtered.map((contact) => (
          <button
            key={contact.phone}
            onClick={() => onSelect(contact.phone)}
            className={cn(
              "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50",
              selectedPhone === contact.phone && "bg-muted"
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
              {(contact.wa_name ?? contact.phone).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {contact.wa_name ?? `+${contact.phone}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                +{contact.phone}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatTime(contact.last_message_at)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Status indicator for outbound messages ---

function StatusIndicator({ status, className }: { status: string; className?: string }) {
  switch (status) {
    case "sent":
      return <Check className={cn("h-3 w-3", className)} />;
    case "delivered":
      return <CheckCheck className={cn("h-3 w-3", className)} />;
    case "read":
      return <CheckCheck className={cn("h-3 w-3 text-sky-400", className)} />;
    default:
      return null;
  }
}

// --- Chat Thread ---

function ChatThread({
  phone,
  contactName,
  messages,
  draft,
  onDraftChange,
  onSend,
  isSending,
  pendingBody,
  sendError,
}: {
  phone: string;
  contactName: string | null;
  messages: WhatsAppMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (body: string) => void;
  isSending: boolean;
  pendingBody: string | null;
  sendError: string | null;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
  }

  const dateGroups = groupMessagesByDate(messages);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
          {(contactName ?? phone).slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-medium">{contactName ?? `+${phone}`}</p>
          <p className="text-xs text-muted-foreground">+{phone}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {dateGroups.map((group) => (
          <div key={group.date}>
            <div className="flex justify-center py-2">
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {group.date}
              </span>
            </div>
            <div className="space-y-2">
              {group.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.direction === "outbound" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg px-3 py-2 text-sm",
                      msg.status === "failed"
                        ? "bg-destructive/15 text-destructive"
                        : msg.direction === "outbound" && msg.status === "sent"
                          ? "bg-muted/50 text-muted-foreground"
                          : msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    {msg.status === "failed" && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        <span>{msg.status_error ?? "Not delivered"}</span>
                      </div>
                    )}
                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1 text-[10px]",
                        msg.status === "failed"
                          ? "text-destructive/70"
                          : msg.direction === "outbound" && msg.status === "sent"
                            ? "text-muted-foreground"
                            : msg.direction === "outbound"
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                      )}
                    >
                      <span>{formatTime(msg.created_at)}</span>
                      {msg.direction === "outbound" && msg.status !== "failed" && (
                        <StatusIndicator status={msg.status} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Pending message — shown while API call is in-flight */}
        {isSending && pendingBody && (
          <div className="flex justify-end">
            <div className="max-w-[70%] rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <p className="whitespace-pre-wrap break-words">{pendingBody}</p>
              <div className="mt-1 flex items-center justify-end gap-1 text-[10px]">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Sending</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {sendError && (
        <div className="mx-4 mb-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {sendError}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Type a message..."
          disabled={isSending}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={isSending || !draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

// --- Page ---

export default function WhatsAppInboxPage() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingBody, setPendingBody] = useState<string | null>(null);

  const { data: contacts = [] } = useWhatsAppContacts();
  const { data: messages = [] } = useWhatsAppMessages(selectedPhone);
  const sendMutation = useSendWhatsAppMessage();
  const queryClient = useQueryClient();

  const selectedContact = contacts.find((c) => c.phone === selectedPhone);

  // Supabase Realtime subscription for new messages
  useEffect(() => {
    const supabase = getClient();

    const channel = supabase
      .channel("whatsapp-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        () => {
          queryClient.invalidateQueries({ queryKey: whatsappKeys.all });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_contacts" },
        () => {
          queryClient.invalidateQueries({ queryKey: whatsappKeys.contacts() });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  function handleSend(body: string) {
    if (!selectedPhone) return;
    setSendError(null);
    setPendingBody(body);

    sendMutation.mutate(
      { to: selectedPhone, body },
      {
        onSuccess: () => {
          setDraft("");
          setPendingBody(null);
        },
        onError: (error) => {
          setSendError(error.message);
          setPendingBody(null);
        },
      }
    );
  }

  function handleSelectContact(phone: string) {
    setSelectedPhone(phone);
    setSendError(null);
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">WhatsApp</h1>
        <p className="text-muted-foreground">
          Send and receive messages via the School of Gaming WhatsApp number.
        </p>
      </div>

      <div className="flex h-[calc(100vh-12rem)] overflow-hidden rounded-lg border border-border bg-card">
        {/* Left panel — contacts */}
        <div className="w-80 shrink-0">
          <ContactList
            contacts={contacts}
            selectedPhone={selectedPhone}
            onSelect={handleSelectContact}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>

        {/* Right panel — chat */}
        <div className="flex-1">
          {selectedPhone ? (
            <ChatThread
              phone={selectedPhone}
              contactName={selectedContact?.wa_name ?? null}
              messages={messages}
              draft={draft}
              onDraftChange={setDraft}
              onSend={handleSend}
              isSending={sendMutation.isPending}
              pendingBody={pendingBody}
              sendError={sendError}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="mb-4 h-12 w-12" />
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
