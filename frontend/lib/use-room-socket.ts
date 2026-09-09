"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { WS_URL } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import type { Message, ServerEnvelope, WsTicket } from "@/lib/types";

export type ConnectionState = "connecting" | "open" | "closed";

// How long a "typing" indicator stays up after the last notice for that
// user, since the server only tells us typing started, never stopped
// (spec 5.2 doesn't define a "stopped typing" event).
const TYPING_TIMEOUT_MS = 3000;

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
    const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

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

    async function connect() {
      // Two-step handshake per spec 5.2: mint a short-lived, single-use
      // ticket over a normal authenticated REST call (JWT in the
      // Authorization header), then open the socket with the ticket in the
      // query string. A raw JWT never goes in a WS URL.
      let ticket: WsTicket;
      try {
        ticket = await apiFetch<WsTicket>(`/rooms/${roomId}/ws-ticket`, { method: "POST" });
      } catch {
        if (!cancelled) {
          setLastError("Couldn't connect to this room.");
          setConnectionState("closed");
        }
        return;
      }
      if (cancelled) return;

      socket = new WebSocket(`${WS_URL}/ws/rooms/${roomId}?ticket=${ticket.ticket}`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!cancelled) setConnectionState("open");
      };

      socket.onclose = () => {
        if (!cancelled) setConnectionState("closed");
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        const envelope: ServerEnvelope = JSON.parse(event.data);

        switch (envelope.type) {
          case "message": {
            const newMessage = envelope.payload;
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
