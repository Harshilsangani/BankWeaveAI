"use client";
import { useState } from "react";
import { MessageSquare, MessageSquarePlus, Search } from "lucide-react";
import type { ConversationSummary } from "@/types/conversations";

export function ChatHistory({
  conversations,
  activeId,
  locked,
  loading,
  error,
  onOpen,
  onNew,
  onRetry,
}: {
  conversations: ConversationSummary[];
  activeId?: string;
  locked: boolean;
  loading: boolean;
  error: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const today = new Date(),
    yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const filtered = conversations.filter((chat) =>
    chat.title.toLowerCase().includes(search.trim().toLowerCase())
  );
  const groups = ["Today", "Yesterday", "Earlier"].map((label) => ({
    label,
    chats: filtered.filter((chat) => {
      const date = new Date(chat.updatedAt).toDateString();
      const group =
        date === today.toDateString()
          ? "Today"
          : date === yesterday.toDateString()
            ? "Yesterday"
            : "Earlier";
      return group === label;
    }),
  }));
  return (
    <section className="chat-history" aria-labelledby="chat-history-heading">
      <div className="chat-history-heading">
        <h2 id="chat-history-heading">Recent chats</h2>
        <button
          className="icon-button"
          aria-label="Start a new chat"
          title="New chat"
          onClick={onNew}
          disabled={locked}
        >
          <MessageSquarePlus size={17} />
        </button>
      </div>
      {conversations.length > 0 && (
        <label className="chat-history-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search chats"
            placeholder="Search chats"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      )}
      {error && (
        <p className="chat-history-error" role="alert">
          {error}{" "}
          <button disabled={locked} onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {loading ? (
        <p className="chat-history-empty" role="status">
          Loading chats…
        </p>
      ) : (
        <div className="chat-history-list">
          {groups
            .filter((group) => group.chats.length)
            .map((group) => (
              <div key={group.label}>
                <p className="chat-history-group">{group.label}</p>
                {group.chats.map((chat) => (
                  <button
                    key={chat.id}
                    className={`chat-history-item ${activeId === chat.id ? "active" : ""}`}
                    aria-current={activeId === chat.id ? "true" : undefined}
                    aria-label={`Open chat: ${chat.title}`}
                    title={`${chat.title} · ${chat.messageCount} ${chat.messageCount === 1 ? "answer" : "answers"}`}
                    disabled={locked}
                    onClick={() => onOpen(chat.id)}
                  >
                    <MessageSquare size={14} aria-hidden="true" />
                    <span>{chat.title}</span>
                  </button>
                ))}
              </div>
            ))}
          {!filtered.length && !error && (
            <p className="chat-history-empty">
              {search ? "No matching chats." : "Your conversations will appear here."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
