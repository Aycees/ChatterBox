"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ApiError, WS_URL } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import type { Message, RoomMemberWithUser, ServerEnvelope, WsTicket } from "@/lib/types";

export type ConnectionState = "connecting" | "open" | "closed";

// How long a "typing" indicator stays up after the last notice for that
// user, since the server only tells us typing started, never stopped
// (spec 5.2 doesn't define a "stopped typing" event).
const TYPING_TIMEOUT_MS = 3000;

// A socket that drops and never comes back leaves the user staring at
// "Disconnected" with no recourse but a manual refresh -- which is not how
// any real-time app behaves. Back off 1s, 2s, 4s, 8s, then every 15s, and
// give up after six tries rather than reconnecting into a dead server
// forever.
const MAX_RECONNECT_ATTEMPTS = 6;
const MAX_RECONNECT_DELAY_MS = 15_000;

// Drives one room's live connection: mints a ws-ticket, opens the native
// WebSocket, and folds incoming envelopes into either the TanStack Query
// message cache (so history and live messages render from one list) or
// local presence/typing state. One hook instance per room the user has
// open.
export function useRoomSocket(roomId: string) {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let hasConnectedBefore = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
    // Ids we've already refetched members for, so a sender the server never
    // returns (someone who has since left) can't trigger a refetch loop.
    const resolvedSenders = new Set<string>();

    // useRoomMembers is fetched once per room and cached, so anyone who joins
    // *after* this page loaded has no username here -- their messages render
    // as "Unknown" and the member count stays stale. Whenever a frame
    // mentions a user the cache doesn't know, refetch the member list once.
    function ensureUserIsKnown(userId: string) {
      const members = queryClient.getQueryData<RoomMemberWithUser[]>([
        "rooms",
        roomId,
        "members",
      ]);
      // Not loaded yet: the members query is already in flight and will
      // arrive with this user in it.
      if (!members) return;
      if (members.some((member) => member.user_id === userId)) return;
      if (resolvedSenders.has(userId)) return;
      resolvedSenders.add(userId);
      queryClient.invalidateQueries({ queryKey: ["rooms", roomId, "members"] });
    }

    // Reset, then kick off the async connect below -- this state's only
    // source of truth is "this effect, for this roomId, is running," so
    // there's no external store to sync from (unlike token in
    // auth-context.tsx, where useSyncExternalStore was the fix). This
    // mirrors React's own documented data-fetching-in-an-effect pattern
    // (see "You Might Not Need an Effect" -> fetching data); the lint rule
    // below is a known false positive on exactly this shape.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnectionState("connecting");
    setOnlineUserIds(new Set());
    setTypingUserIds(new Set());

    function scheduleReconnect() {
      if (cancelled) return;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionState("closed");
        return;
      }
      const delay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
      attempt += 1;
      setConnectionState("connecting");
      retryTimer = setTimeout(connect, delay);
    }

    async function connect() {
      // Two-step handshake per spec 5.2: mint a short-lived, single-use
      // ticket over a normal authenticated REST call (JWT in the
      // Authorization header), then open the socket with the ticket in the
      // query string. A raw JWT never goes in a WS URL.
      let ticket: WsTicket;
      try {
        ticket = await apiFetch<WsTicket>(`/rooms/${roomId}/ws-ticket`, { method: "POST" });
      } catch (error) {
        if (cancelled) return;
        // A 4xx here is an answer, not a blip: the room doesn't exist, or
        // you're not a member of it. Retrying can't change that, so don't.
        // Anything else (network down, 5xx) is worth another try.
        const fatal = error instanceof ApiError && error.status >= 400 && error.status < 500;
        setLastError("Couldn't connect to this room.");
        if (fatal) setConnectionState("closed");
        else scheduleReconnect();
        return;
      }
      if (cancelled) return;

      socket = new WebSocket(`${WS_URL}/ws/rooms/${roomId}?ticket=${ticket.ticket}`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (cancelled) return;
        setConnectionState("open");
        setLastError(null);
        attempt = 0;
        // Messages sent while we were disconnected never arrived over the
        // socket, so the cached history has a hole in it. Refetch on a
        // *re*connect only -- on the first open the query is already loading.
        if (hasConnectedBefore) {
          queryClient.invalidateQueries({ queryKey: ["rooms", roomId, "messages"] });
        }
        hasConnectedBefore = true;
      };

      socket.onclose = () => {
        if (!cancelled) scheduleReconnect();
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        const envelope: ServerEnvelope = JSON.parse(event.data);

        switch (envelope.type) {
          case "message": {
            const newMessage = envelope.payload;
            ensureUserIsKnown(newMessage.sender_id);
            queryClient.setQueryData<InfiniteData<Message[]>>(
              ["rooms", roomId, "messages"],
              (old) => {
                if (!old) return old;
                const [firstPage, ...restPages] = old.pages;
                return { ...old, pages: [[newMessage, ...firstPage], ...restPages] };
              }
            );
            break;
          }
          case "presence": {
            const { user_id, status } = envelope.payload;
            if (status === "online") ensureUserIsKnown(user_id);
            setOnlineUserIds((prev) => {
              const next = new Set(prev);
              if (status === "online") next.add(user_id);
              else next.delete(user_id);
              return next;
            });
            break;
          }
          case "typing": {
            const { user_id } = envelope.payload;
            ensureUserIsKnown(user_id);
            setTypingUserIds((prev) => new Set(prev).add(user_id));
            clearTimeout(typingTimeouts.get(user_id));
            typingTimeouts.set(
              user_id,
              setTimeout(() => {
                setTypingUserIds((prev) => {
                  const next = new Set(prev);
                  next.delete(user_id);
                  return next;
                });
              }, TYPING_TIMEOUT_MS)
            );
            break;
          }
          case "error": {
            setLastError(envelope.payload.detail);
            break;
          }
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      socket?.close();
      socketRef.current = null;
      typingTimeouts.forEach(clearTimeout);
    };
  }, [roomId, queryClient]);

  const sendMessage = useCallback((content: string) => {
    socketRef.current?.send(JSON.stringify({ type: "message", payload: { content } }));
  }, []);

  const sendTyping = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "typing", payload: {} }));
  }, []);

  return { connectionState, onlineUserIds, typingUserIds, lastError, sendMessage, sendTyping };
}
