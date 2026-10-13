"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import type { ConversationSummary } from "@/types/conversations";

export function ChatHistory({
  conversations,
  activeId,
  locked,
  loading,
  error,
  onOpen,
  onRetry,
}: {
  conversations: ConversationSummary[];
  activeId?: string;
  locked: boolean;
  loading: boolean;
  error: string;
  onOpen: (id: string) => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const filtered = conversations.filter((chat) =>
    chat.title.toLowerCase().includes(search.trim().toLowerCase())
  );
  return (
    <section className="chat-history" aria-labelledby="chat-history-heading">
      <div className="chat-history-heading">
        <h2 id="chat-history-heading">Recent</h2>
        {conversations.length > 0 && (
          <button
            className="chat-history-search-toggle"
            aria-label="Search recent chats"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open);
              setSearch("");
            }}
          >
            <Search size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {searchOpen && conversations.length > 0 && (
        <label className="chat-history-search">
          <Search size={13} aria-hidden="true" />
          <input
            autoFocus
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
          {filtered.map((chat) => (
            <button
              key={chat.id}
              className={`chat-history-item ${activeId === chat.id ? "active" : ""}`}
              aria-current={activeId === chat.id ? "true" : undefined}
              aria-label={`Open chat: ${chat.title}`}
              title={`${chat.title} · ${chat.messageCount} ${chat.messageCount === 1 ? "answer" : "answers"}`}
              disabled={locked}
              onClick={() => onOpen(chat.id)}
            >
              <span>{chat.title}</span>
            </button>
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
