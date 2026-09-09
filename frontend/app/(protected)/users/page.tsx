"use client";

import { useEffect, useState } from "react";
import { useUsers } from "@/lib/use-users";
import type { User } from "@/lib/types";
import { InviteModal } from "./invite-modal";

const SEARCH_DEBOUNCE_MS = 300;

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [inviteTarget, setInviteTarget] = useState<User | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const users = useUsers(debouncedSearch);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">Users</h1>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by username or email"
          className="w-full rounded border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>

      {users.isPending && <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>}
      {users.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load users.</p>
      )}
      {users.data && users.data.length === 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No users found.</p>
      )}

      <ul className="space-y-2">
        {users.data?.map((user) => (
          <li
            key={user.id}
            className="flex items-center justify-between rounded border border-black/10 px-4 py-2 text-sm dark:border-white/10"
          >
            <div>
              <p className="text-black dark:text-zinc-50">{user.username}</p>
              <p className="text-xs text-zinc-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => setInviteTarget(user)}
              className="rounded border border-black/10 px-3 py-1 dark:border-white/10"
            >
              Invite
            </button>
          </li>
        ))}
      </ul>

      {inviteTarget && (
        <InviteModal targetUser={inviteTarget} onClose={() => setInviteTarget(null)} />
      )}
    </main>
  );
}
