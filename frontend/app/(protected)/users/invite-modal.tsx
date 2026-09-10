"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useCreateInvite } from "@/lib/use-invites";
import { useMyRooms } from "@/lib/use-rooms";
import { useCurrentUser } from "@/lib/use-current-user";
import type { UserDirectoryEntry } from "@/lib/types";

type InviteModalProps = {
  targetUser: UserDirectoryEntry;
  onClose: () => void;
};

// Only rooms the caller owns are offered here -- room_invites_insert (see
// backend migration e539495125d5) only lets a room's owner create an
// invite for it, so a member-owned-nothing user would never see this modal
// do anything useful anyway.
export function InviteModal({ targetUser, onClose }: InviteModalProps) {
  const { data: currentUser } = useCurrentUser();
  const { data: rooms, isPending: roomsPending } = useMyRooms();
  const createInvite = useCreateInvite();

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const ownedRooms = (rooms ?? []).filter((room) => room.owner_id === currentUser?.id);

  function handleSubmit() {
    if (!selectedRoomId) return;
    createInvite.mutate({ roomId: selectedRoomId, invitedUserId: targetUser.id });
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="invite-modal-title" className="mb-1 text-lg font-semibold text-black dark:text-zinc-50">
          Invite {targetUser.username}
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Choose one of your rooms to invite them to.
        </p>

        {createInvite.isSuccess ? (
          <div className="space-y-4">
            <p className="text-sm text-black dark:text-zinc-50">Invite sent.</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {roomsPending && <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading your rooms...</p>}

            {!roomsPending && ownedRooms.length === 0 && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                You don&apos;t own any rooms yet. Create one first.
              </p>
            )}

            {ownedRooms.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {ownedRooms.map((room) => (
                  <li key={room.id}>
                    <label className="flex items-center gap-2 rounded border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                      <input
                        type="radio"
                        name="room"
                        value={room.id}
                        checked={selectedRoomId === room.id}
                        onChange={() => setSelectedRoomId(room.id)}
                      />
                      <span className="text-black dark:text-zinc-50">{room.name}</span>
                      {room.is_private && <span className="text-xs text-zinc-500">Private</span>}
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {createInvite.isError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {createInvite.error instanceof ApiError
                  ? createInvite.error.message
                  : "Couldn't send invite"}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-black/10 px-4 py-2 text-sm dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedRoomId || createInvite.isPending}
                className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {createInvite.isPending ? "Inviting..." : "Send invite"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
