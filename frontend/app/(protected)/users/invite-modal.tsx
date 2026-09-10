"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useCreateInvite } from "@/lib/use-invites";
import { useMyRooms } from "@/lib/use-rooms";
import { useCurrentUser } from "@/lib/use-current-user";
import type { UserDirectoryEntry } from "@/lib/types";
import { Alert } from "@/components/alert";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Skeleton } from "@/components/skeleton";
import { CheckIcon, HashIcon, LockIcon } from "@/components/icons";

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
  const dialogRef = useRef<HTMLDivElement>(null);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const ownedRooms = (rooms ?? []).filter((room) => room.owner_id === currentUser?.id);

  // The one dialog in the app, so the one place that owns Escape.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleSubmit() {
    if (!selectedRoomId) return;
    createInvite.mutate({ roomId: selectedRoomId, invitedUserId: targetUser.id });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
        // The only elevated surface in the app -- shadows are reserved for
        // things that genuinely float above the page.
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-md focus-visible:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        {createInvite.isSuccess ? (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-success-subtle text-success-text">
              <CheckIcon className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">Invite sent</p>
            <p className="mt-1 text-sm text-text-secondary">
              {targetUser.username} will see it the next time they open ChatterBox.
            </p>
            <Button onClick={onClose} className="mt-5 w-full">
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <Avatar username={targetUser.username} size="md" />
              <div className="min-w-0">
                <h2
                  id="invite-modal-title"
                  className="truncate text-base font-semibold text-foreground"
                >
                  Invite {targetUser.username}
                </h2>
                <p className="text-xs text-text-secondary">Pick a room you own.</p>
              </div>
            </div>

            {roomsPending && (
              <div className="space-y-1.5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {!roomsPending && ownedRooms.length === 0 && (
              <p className="rounded-lg bg-surface-sunken px-3 py-3 text-sm text-text-secondary">
                You don&apos;t own any rooms yet. Create one first, then come back to invite
                people to it.
              </p>
            )}

            {ownedRooms.length > 0 && (
              <fieldset className="scroll-thin max-h-56 space-y-1 overflow-y-auto">
                <legend className="sr-only">Rooms you own</legend>
                {ownedRooms.map((room) => {
                  const selected = selectedRoomId === room.id;
                  return (
                    <label
                      key={room.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-150",
                        selected
                          ? "border-accent-text bg-accent-subtle text-accent-text"
                          : "border-border text-foreground hover:bg-surface-raised"
                      )}
                    >
                      <input
                        type="radio"
                        name="room"
                        value={room.id}
                        checked={selected}
                        onChange={() => setSelectedRoomId(room.id)}
                        className="sr-only"
                      />
                      {room.is_private ? (
                        <LockIcon className="h-4 w-4 shrink-0" />
                      ) : (
                        <HashIcon className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">{room.name}</span>
                      {selected && <CheckIcon className="ml-auto h-4 w-4 shrink-0" />}
                    </label>
                  );
                })}
              </fieldset>
            )}

            {createInvite.isError && (
              <Alert className="mt-3">
                {createInvite.error instanceof ApiError
                  ? createInvite.error.message
                  : "Couldn't send that invite."}
              </Alert>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!selectedRoomId || createInvite.isPending}
              >
                {createInvite.isPending ? "Sending" : "Send invite"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
