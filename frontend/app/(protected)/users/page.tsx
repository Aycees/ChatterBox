"use client";

import { useEffect, useState } from "react";
import { useUsers } from "@/lib/use-users";
import type { UserDirectoryEntry } from "@/lib/types";
import { Alert } from "@/components/alert";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { PaneHeader } from "@/components/pane-header";
import { Skeleton } from "@/components/skeleton";
import { PeopleIcon, SearchIcon } from "@/components/icons";
import { InviteModal } from "./invite-modal";

const SEARCH_DEBOUNCE_MS = 300;

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [inviteTarget, setInviteTarget] = useState<UserDirectoryEntry | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const users = useUsers(debouncedSearch);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PaneHeader title="People" icon={<PeopleIcon />} />

      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6">
          <div className="relative mb-4">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by username"
              aria-label="Search people"
              className="w-full rounded-lg border border-border bg-surface-sunken py-2.5 pr-3 pl-9 text-sm text-foreground placeholder:text-text-muted transition-colors duration-150 focus:border-accent-text"
            />
          </div>

          {users.isPending && (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          )}

          {users.isError && <Alert>Couldn&apos;t load the directory.</Alert>}

          {users.data?.length === 0 && (
            <EmptyState
              icon={<SearchIcon className="h-5 w-5" />}
              title="No one by that name"
              description={
                debouncedSearch
                  ? `Nothing matches "${debouncedSearch}". Try a shorter search.`
                  : "The directory is empty."
              }
            />
          )}

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {users.data?.map((user) => (
              <li
                key={user.id}
                className="flex items-center gap-3 bg-surface px-3 py-2.5 transition-colors duration-150 hover:bg-surface-raised"
              >
                <Avatar username={user.username} size="md" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {user.username}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setInviteTarget(user)}>
                  Invite
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {inviteTarget && (
        <InviteModal targetUser={inviteTarget} onClose={() => setInviteTarget(null)} />
      )}
    </div>
  );
}
