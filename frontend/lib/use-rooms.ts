"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Room, RoomMember } from "@/lib/types";

// The API returns rooms in insertion order, which reads as random in a
// sidebar and reshuffles as rooms are created. Sorting client-side keeps the
// rail stable between renders and between sessions. (Most-recent-activity
// would be the better order for a chat app, but no endpoint exposes a
// room's last message yet -- see spec 5.1.)
function byName(rooms: Room[]): Room[] {
  return [...rooms].sort((a, b) => a.name.localeCompare(b.name));
}

export function useMyRooms() {
  return useQuery({
    queryKey: ["rooms", "mine"],
    queryFn: () => apiFetch<Room[]>("/rooms"),
    select: byName,
  });
}

export function usePublicRooms() {
  return useQuery({
    queryKey: ["rooms", "public"],
    queryFn: () => apiFetch<Room[]>("/rooms/public"),
    select: byName,
  });
}

type CreateRoomInput = {
  name: string;
  is_private: boolean;
};

export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRoomInput) =>
      apiFetch<Room>("/rooms", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    // Refetch both lists: a new public room belongs on the public list too,
    // and either way the creator is now a member.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rooms"] }),
  });
}

export function useJoinRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) =>
      apiFetch<RoomMember>(`/rooms/${roomId}/join`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rooms"] }),
  });
}
