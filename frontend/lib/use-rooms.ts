"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Room, RoomMember } from "@/lib/types";

export function useMyRooms() {
  return useQuery({
    queryKey: ["rooms", "mine"],
    queryFn: () => apiFetch<Room[]>("/rooms"),
  });
}

export function usePublicRooms() {
  return useQuery({
    queryKey: ["rooms", "public"],
    queryFn: () => apiFetch<Room[]>("/rooms/public"),
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
