"use client";

import { useParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/cn";
import { describeTyping, formatDayDivider, formatTime, isSameDay } from "@/lib/format";
import { flattenMessagePages, useRoomMessages } from "@/lib/use-room-messages";
import { useRoomMembers } from "@/lib/use-room-members";
import { useRoomSocket } from "@/lib/use-room-socket";
import { useCurrentUser } from "@/lib/use-current-user";
import { useMyRooms } from "@/lib/use-rooms";
import { Alert } from "@/components/alert";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ConnectionStatus } from "@/components/connection-status";
import { EmptyState } from "@/components/empty-state";
import { MessageSkeleton } from "@/components/skeleton";
import { PaneHeader } from "@/components/pane-header";
import { TypingIndicator } from "@/components/typing-indicator";
import { HashIcon, LockIcon, SendIcon } from "@/components/icons";

// Only send a "typing" notice at most this often while the user keeps
// typing, instead of on every keystroke -- the backend has no debouncing
// of its own, it just relays whatever it receives.
const TYPING_SEND_INTERVAL_MS = 1500;

const MAX_MESSAGE_LENGTH = 4000;
// Below this the counter is noise; near the cap it's the only warning you
// get before the input silently stops accepting characters.
const COUNTER_THRESHOLD = 3500;

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { data: currentUser } = useCurrentUser();
  const { data: myRooms } = useMyRooms();
  const room = myRooms?.find((candidate) => candidate.id === roomId);

  const messages = useRoomMessages(roomId);
  const { data: members } = useRoomMembers(roomId);
  const { connectionState, onlineUserIds, typingUserIds, lastError, sendMessage, sendTyping } =
    useRoomSocket(roomId);

  const [draft, setDraft] = useState("");
  const lastTypingSentAtRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const flatMessages = flattenMessagePages(messages.data?.pages ?? []);
  const usernameById = useMemo(
    () => new Map((members ?? []).map((member) => [member.user_id, member.username])),
    [members]
  );

  const newestMessageId = flatMessages.at(-1)?.id;

  useEffect(() => {
    // Keyed on the newest message, not the message *count*: loading an older
    // page also grows the list, and scrolling to the bottom when someone
    // asked to read history is the opposite of what they wanted.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [newestMessageId]);

  function handleDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (now - lastTypingSentAtRef.current > TYPING_SEND_INTERVAL_MS) {
      sendTyping();
      lastTypingSentAtRef.current = now;
    }
  }

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || connectionState !== "open") return;
    sendMessage(content);
    setDraft("");
    // The textarea grows with its content, so it has to be told to shrink
    // back once the content is gone.
    if (composerRef.current) composerRef.current.style.height = "auto";
  }

  // Enter sends, Shift+Enter breaks the line -- the convention every chat
  // app shares, and the reason the composer is a textarea and not an input.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  // The server relays typing to the whole room, so filter yourself out --
  // being told you are typing is not information.
  const typingNames = [...typingUserIds]
    .filter((id) => id !== currentUser?.id)
    .map((id) => usernameById.get(id) ?? "Someone");

  const canSend = connectionState === "open" && draft.trim().length > 0;
  const remaining = MAX_MESSAGE_LENGTH - draft.length;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PaneHeader
        icon={room?.is_private ? <LockIcon /> : <HashIcon />}
        title={room?.name ?? "Room"}
        subtitle={
          members ? `${members.length} ${members.length === 1 ? "member" : "members"}` : undefined
        }
        trailing={
          <ConnectionStatus state={connectionState} onlineCount={onlineUserIds.size} />
        }
      />

      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto">
        {/* min-h-full + justify-end anchors a short history to the bottom of
            the pane, against the composer, instead of leaving it stranded at
            the top under a field of empty space. */}
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end px-4 py-4 md:px-6">
          {messages.hasNextPage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => messages.fetchNextPage()}
              disabled={messages.isFetchingNextPage}
              className="mb-2 self-center"
            >
              {messages.isFetchingNextPage ? "Loading" : "Load older messages"}
            </Button>
          )}

          {messages.isPending && <MessageSkeleton />}

          {messages.isSuccess && flatMessages.length === 0 && (
            <EmptyState
              icon={<HashIcon className="h-5 w-5" />}
              title={`This is the start of ${room?.name ?? "the room"}`}
              description="No messages yet. Say something and everyone here sees it instantly."
            />
          )}

          {/* aria-relevant="additions" so a screen reader hears arriving
              messages, which is what sighted users already get for free. */}
          <ol aria-live="polite" aria-relevant="additions" className="flex flex-col">
            {flatMessages.map((message, index) => {
              const isMine = message.sender_id === currentUser?.id;
              const previous = flatMessages[index - 1];
              const username = usernameById.get(message.sender_id) ?? "Unknown";

              const showDay =
                !previous ||
                !isSameDay(new Date(previous.created_at), new Date(message.created_at));
              // A "run" is consecutive messages from one person on one day.
              // Only the first of a run carries the avatar and name, the way
              // every chat app people already use does it.
              const startsRun = showDay || previous?.sender_id !== message.sender_id;

              return (
                <li key={message.id}>
                  {showDay && <DayDivider label={formatDayDivider(message.created_at)} />}
                  <div
                    className={cn(
                      "group flex items-end gap-2.5",
                      // Not `first:mt-0`: the `first:` variant means
                      // :first-child, and this div is the first child of its
                      // own <li> on every row that has no day divider above
                      // it -- so it zeroed the gap on nearly every run
                      // instead of only on the very first message.
                      index === 0 ? "" : startsRun ? "mt-5" : "mt-1",
                      isMine ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {!isMine &&
                      (startsRun ? (
                        <Avatar
                          username={username}
                          online={onlineUserIds.has(message.sender_id)}
                        />
                      ) : (
                        // Keeps the rest of a run aligned under its first bubble.
                        <span aria-hidden="true" className="w-7 shrink-0" />
                      ))}

                    <div
                      className={cn(
                        "flex min-w-0 max-w-[85%] flex-col",
                        isMine ? "items-end" : "items-start"
                      )}
                    >
                      {startsRun && !isMine && (
                        <span className="mb-1 px-1 text-xs font-medium text-text-secondary">
                          {username}
                        </span>
                      )}
                      {/* The timestamp is a sibling of the bubble, not a line
                          under it: revealed on hover it must cost no vertical
                          space, or every message pays for a row it never shows. */}
                      <div
                        className={cn(
                          "flex min-w-0 items-end gap-2",
                          isMine ? "flex-row-reverse" : "flex-row"
                        )}
                      >
                        <div
                          className={cn(
                            "animate-message-in min-w-0 px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
                            isMine
                              ? "rounded-2xl rounded-br-md bg-accent text-text-on-brand"
                              : "rounded-2xl rounded-bl-md border border-border bg-surface-raised text-foreground"
                          )}
                        >
                          {message.content}
                        </div>
                        <time
                          dateTime={message.created_at}
                          className="shrink-0 pb-0.5 text-xs tabular-nums whitespace-nowrap text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        >
                          {formatTime(message.created_at)}
                        </time>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="shrink-0 border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-4 pt-2 pb-3 md:px-6">
          {connectionState === "open" ? (
            <TypingIndicator label={typingNames.length > 0 ? describeTyping(typingNames) : ""} />
          ) : (
            // Says why the composer is inert. The socket hook has no retry
            // loop, so "refresh" is the honest instruction, not "hold on".
            <p className="flex h-5 items-center text-xs text-text-muted">
              {connectionState === "connecting"
                ? "Connecting to this room"
                : "Disconnected. Refresh the page to reconnect."}
            </p>
          )}

          {lastError && <Alert className="mb-2">{lastError}</Alert>}

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-surface-sunken focus-within:border-accent-text">
              <textarea
                ref={composerRef}
                rows={1}
                value={draft}
                onChange={(event) => {
                  handleDraftChange(event.target.value);
                  event.target.style.height = "auto";
                  event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={handleKeyDown}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder={`Message ${room?.name ?? "this room"}`}
                aria-label="Message"
                className="max-h-40 w-full resize-none bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none"
              />
              {draft.length > COUNTER_THRESHOLD && (
                <span className="px-3.5 pb-1.5 text-right text-xs tabular-nums text-text-muted">
                  {remaining} left
                </span>
              )}
            </div>
            <Button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className="h-11 w-11 shrink-0 px-0"
            >
              <SendIcon />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

// A hairline that the label sits on top of, rather than a full-width bar --
// it separates days without stopping the eye the way a solid band would.
function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
