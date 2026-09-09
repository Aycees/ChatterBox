"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flattenMessagePages, useRoomMessages } from "@/lib/use-room-messages";
import { useRoomMembers } from "@/lib/use-room-members";
import { useRoomSocket } from "@/lib/use-room-socket";
import { useCurrentUser } from "@/lib/use-current-user";
import { useMyRooms } from "@/lib/use-rooms";

// Only send a "typing" notice at most this often while the user keeps
// typing, instead of on every keystroke -- the backend has no debouncing
// of its own, it just relays whatever it receives.
const TYPING_SEND_INTERVAL_MS = 1500;

function initials(username: string): string {
  return username.charAt(0).toUpperCase();
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { data: currentUser } = useCurrentUser();
  const { data: myRooms } = useMyRooms();
  const roomName = myRooms?.find((room) => room.id === roomId)?.name ?? "Room";

  const messages = useRoomMessages(roomId);
  const { data: members } = useRoomMembers(roomId);
  const { connectionState, onlineUserIds, typingUserIds, lastError, sendMessage, sendTyping } =
    useRoomSocket(roomId);

  const [draft, setDraft] = useState("");
  const lastTypingSentAtRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const flatMessages = flattenMessagePages(messages.data?.pages ?? []);
  const usernameById = useMemo(
    () => new Map((members ?? []).map((member) => [member.user_id, member.username])),
    [members]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [flatMessages.length]);

  function handleDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (now - lastTypingSentAtRef.current > TYPING_SEND_INTERVAL_MS) {
      sendTyping();
      lastTypingSentAtRef.current = now;
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    sendMessage(content);
    setDraft("");
  }

  const typingUsernames = [...typingUserIds];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">{roomName}</h1>
        <span className="text-xs text-zinc-500">
          {connectionState === "open" && `${onlineUserIds.size} online`}
          {connectionState === "connecting" && "Connecting..."}
          {connectionState === "closed" && "Disconnected"}
        </span>
      </div>

      {messages.hasNextPage && (
        <button
          type="button"
          onClick={() => messages.fetchNextPage()}
          disabled={messages.isFetchingNextPage}
          className="mb-2 self-center rounded border border-black/10 px-3 py-1 text-xs disabled:opacity-50 dark:border-white/10"
        >
          {messages.isFetchingNextPage ? "Loading..." : "Load older messages"}
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto rounded border border-black/10 p-4 dark:border-white/10"
      >
        {messages.isPending && <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading messages...</p>}
        {flatMessages.map((message, index) => {
          const isMine = message.sender_id === currentUser?.id;
          const previous = flatMessages[index - 1];
          const isNewRun = !previous || previous.sender_id !== message.sender_id;
          const showSenderInfo = isNewRun && !isMine;
          const username = usernameById.get(message.sender_id) ?? "Unknown";
          return (
            <div key={message.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
              {showSenderInfo && (
                <div className="mb-1 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10 text-xs font-medium text-black dark:bg-white/10 dark:text-zinc-50"
                  >
                    {initials(username)}
                  </span>
                  <span className="text-xs font-medium text-zinc-500">{username}</span>
                </div>
              )}
              <div
                className={`max-w-[75%] rounded px-3 py-2 text-sm ${
                  isMine
                    ? "bg-foreground text-background"
                    : "bg-black/5 text-black dark:bg-white/10 dark:text-zinc-50"
                }`}
              >
                {message.content}
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-5 text-xs text-zinc-500">
        {typingUsernames.length > 0 &&
          `${typingUsernames.length === 1 ? "Someone is" : `${typingUsernames.length} people are`} typing...`}
      </div>

      {lastError && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{lastError}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          placeholder="Message"
          maxLength={4000}
          className="flex-1 rounded border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
        <button
          type="submit"
          disabled={connectionState !== "open"}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
