"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Invite, InviteWithDetails, RoomMember } from "@/lib/types";

// Pending invites addressed to me -- the "who invited me" component.
export function useMyInvites() {
  return useQuery({
    queryKey: ["invites", "mine"],
    queryFn: () => apiFetch<InviteWithDetails[]>("/invites/me"),
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: ({ roomId, invitedUserId }: { roomId: string; invitedUserId: string }) =>
      apiFetch<Invite>(`/rooms/${roomId}/invites`, {
        method: "POST",
        body: JSON.stringify({ invited_user_id: invitedUserId }),
      }),
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch<RoomMember>(`/invites/${inviteId}/accept`, { method: "POST" }),
    // Accepting adds a room, not just clears an invite -- both lists are stale.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

export function useDeclineInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch<Invite>(`/invites/${inviteId}/decline`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites"] }),
  });
}
