"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { RoomMemberWithUser } from "@/lib/types";

// Fetched once per room and cached -- gives the chat view a sender_id ->
// username lookup for display, since neither Message nor the WS envelopes
// (spec 5.2) carry a username themselves.
export function useRoomMembers(roomId: string) {
  return useQuery({
    queryKey: ["rooms", roomId, "members"],
    queryFn: () => apiFetch<RoomMemberWithUser[]>(`/rooms/${roomId}/members`),
  });
}
