"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { useAcceptInvite, useDeclineInvite, useMyInvites } from "@/lib/use-invites";
import { useCreateRoom, useJoinRoom, useMyRooms, usePublicRooms } from "@/lib/use-rooms";

export default function RoomsPage() {
  const myRooms = useMyRooms();
  const publicRooms = usePublicRooms();
  const createRoom = useCreateRoom();
  const joinRoom = useJoinRoom();
  const myInvites = useMyInvites();
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();

  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const myRoomIds = new Set((myRooms.data ?? []).map((room) => room.id));

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    createRoom.mutate(
      { name: name.trim(), is_private: isPrivate },
      { onSuccess: () => setName("") }
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8">
      {myInvites.data && myInvites.data.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">Invitations</h2>
          <ul className="space-y-2">
            {myInvites.data.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between rounded border border-black/10 px-4 py-2 text-sm dark:border-white/10"
              >
                <span className="text-black dark:text-zinc-50">
                  <span className="font-medium">{invite.invited_by_username}</span> invited you to{" "}
                  <span className="font-medium">{invite.room_name}</span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => acceptInvite.mutate(invite.id)}
                    disabled={acceptInvite.isPending || declineInvite.isPending}
                    className="rounded bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => declineInvite.mutate(invite.id)}
                    disabled={acceptInvite.isPending || declineInvite.isPending}
                    className="rounded border border-black/10 px-3 py-1 text-xs disabled:opacity-50 dark:border-white/10"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {(acceptInvite.isError || declineInvite.isError) && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {(acceptInvite.error ?? declineInvite.error) instanceof ApiError
                ? (acceptInvite.error ?? declineInvite.error)?.message
                : "Couldn't update invite"}
            </p>
          )}
        </section>
      )}

      <section>
        <h1 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">Your rooms</h1>
        {myRooms.isPending && <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>}
        {myRooms.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load your rooms.</p>
        )}
        {myRooms.data && myRooms.data.length === 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You&apos;re not in any rooms yet. Join a public room below or create your own.
          </p>
        )}
        <ul className="space-y-2">
          {myRooms.data?.map((room) => (
            <li key={room.id}>
              <Link
                href={`/rooms/${room.id}`}
                className="flex items-center justify-between rounded border border-black/10 px-4 py-2 text-sm hover:bg-black/3 dark:border-white/10 dark:hover:bg-white/5"
              >
                <span className="text-black dark:text-zinc-50">{room.name}</span>
                {room.is_private && <span className="text-xs text-zinc-500">Private</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">Create a room</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Room name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="flex-1 rounded border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(event) => setIsPrivate(event.target.checked)}
            />
            Private
          </label>
          <button
            type="submit"
            disabled={createRoom.isPending}
            className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {createRoom.isPending ? "Creating..." : "Create"}
          </button>
        </form>
        {createRoom.isError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {createRoom.error instanceof ApiError ? createRoom.error.message : "Couldn't create room"}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">Public rooms</h2>
        {publicRooms.isPending && <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>}
        {publicRooms.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load public rooms.</p>
        )}
        <ul className="space-y-2">
          {publicRooms.data?.map((room) => {
            const alreadyMember = myRoomIds.has(room.id);
            return (
              <li
                key={room.id}
                className="flex items-center justify-between rounded border border-black/10 px-4 py-2 text-sm dark:border-white/10"
              >
                <span className="text-black dark:text-zinc-50">{room.name}</span>
                {alreadyMember ? (
                  <Link href={`/rooms/${room.id}`} className="font-medium text-black underline dark:text-zinc-50">
                    Open
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => joinRoom.mutate(room.id)}
                    disabled={joinRoom.isPending}
                    className="rounded border border-black/10 px-3 py-1 disabled:opacity-50 dark:border-white/10"
                  >
                    Join
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
