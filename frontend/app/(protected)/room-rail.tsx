"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth-context";
import { useCurrentUser } from "@/lib/use-current-user";
import { useMyInvites } from "@/lib/use-invites";
import { useCreateRoom, useJoinRoom, useMyRooms, usePublicRooms } from "@/lib/use-rooms";
import { Alert } from "@/components/alert";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { InviteList } from "@/components/invite-list";
import { RoomRowSkeleton } from "@/components/skeleton";
import {
  HashIcon,
  LockIcon,
  MailIcon,
  PeopleIcon,
  PlusIcon,
  SignOutIcon,
} from "@/components/icons";

// The persistent left rail. Previously the room list *was* a page, so
// opening a room replaced it entirely and you lost all sense of where you
// were. Same data hooks as before -- this is purely where they're rendered.
export function RoomRail() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { data: user } = useCurrentUser();
  const myRooms = useMyRooms();
  const publicRooms = usePublicRooms();
  const createRoom = useCreateRoom();
  const joinRoom = useJoinRoom();
  const invites = useMyInvites();

  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const myRoomIds = new Set((myRooms.data ?? []).map((room) => room.id));
  // Rooms you're already in are listed above; repeating them under Discover
  // would just be the same list twice.
  const discoverable = (publicRooms.data ?? []).filter((room) => !myRoomIds.has(room.id));
  const pendingInvites = invites.data?.length ?? 0;

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    createRoom.mutate(
      { name: name.trim(), is_private: isPrivate },
      {
        onSuccess: () => {
          setName("");
          setIsPrivate(false);
          setComposing(false);
        },
      }
    );
  }

  return (
    <div className="flex h-full w-full flex-col border-border bg-surface-raised md:w-72 md:border-r">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
          ChatterBox
        </Link>
        <button
          type="button"
          onClick={() => setComposing((open) => !open)}
          aria-expanded={composing}
          aria-label={composing ? "Cancel new room" : "New room"}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150",
            composing
              ? "bg-accent-subtle text-accent-text"
              : "text-text-secondary hover:bg-surface-sunken hover:text-foreground"
          )}
        >
          <PlusIcon className={cn("h-4 w-4 transition-transform", composing && "rotate-45")} />
        </button>
      </div>

      {composing && (
        <form onSubmit={handleCreate} className="space-y-2 px-4 pb-3">
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Room name"
            aria-label="Room name"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-accent-text"
          />
          <Checkbox
            label="Private, invite only"
            checked={isPrivate}
            onChange={(event) => setIsPrivate(event.target.checked)}
          />
          <Button type="submit" size="sm" disabled={createRoom.isPending} className="w-full">
            {createRoom.isPending ? "Creating" : "Create room"}
          </Button>
          {createRoom.isError && (
            <Alert>
              {createRoom.error instanceof ApiError
                ? createRoom.error.message
                : "Couldn't create that room."}
            </Alert>
          )}
        </form>
      )}

      <nav className="space-y-0.5 px-2 pb-2">
        {/* Hidden on mobile: at "/" the phone shows only this rail, so the
            pane this links to would never appear. The md:hidden block below
            renders the invitations here instead. */}
        <RailLink
          href="/"
          active={pathname === "/"}
          icon={<MailIcon />}
          className="hidden md:flex"
        >
          Invitations
          {pendingInvites > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-medium text-text-on-brand">
              {pendingInvites}
            </span>
          )}
        </RailLink>
        <RailLink href="/users" active={pathname === "/users"} icon={<PeopleIcon />}>
          People
        </RailLink>
      </nav>

      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-2">
        {pendingInvites > 0 && (
          <div className="md:hidden">
            <RailSection title="Invitations" />
            <div className="px-1 pb-1">
              <InviteList compact />
            </div>
          </div>
        )}

        <RailSection title="Rooms" />
        {myRooms.isPending && <RoomRowSkeleton />}
        {myRooms.isError && (
          <p className="px-2 py-1 text-xs text-danger-text">Couldn&apos;t load your rooms.</p>
        )}
        {myRooms.data?.length === 0 && (
          <p className="px-2 pb-2 text-xs leading-relaxed text-text-muted">
            No rooms yet. Create one above, or join a public room below.
          </p>
        )}
        <ul>
          {myRooms.data?.map((room) => (
            <li key={room.id}>
              <RailLink
                href={`/rooms/${room.id}`}
                active={pathname === `/rooms/${room.id}`}
                icon={room.is_private ? <LockIcon /> : <HashIcon />}
              >
                <span className="truncate">{room.name}</span>
              </RailLink>
            </li>
          ))}
        </ul>

        {discoverable.length > 0 && (
          <>
            <RailSection title="Discover" />
            <ul>
              {discoverable.map((room) => (
                <li
                  key={room.id}
                  className="group flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-text-secondary md:py-1.5"
                >
                  <HashIcon className="h-4 w-4 shrink-0 text-text-muted" />
                  <span className="truncate">{room.name}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => joinRoom.mutate(room.id)}
                    disabled={joinRoom.isPending}
                    className="ml-auto"
                  >
                    Join
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3 py-3">
        <Avatar username={user?.username ?? "?"} size="md" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {user?.username ?? " "}
        </span>
        <button
          type="button"
          onClick={logout}
          aria-label="Log out"
          title="Log out"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors duration-150 hover:bg-surface-sunken hover:text-foreground"
        >
          <SignOutIcon />
        </button>
      </div>
    </div>
  );
}

function RailSection({ title }: { title: string }) {
  return <p className="px-2 pt-4 pb-1 text-xs font-medium text-text-muted">{title}</p>;
}

function RailLink({
  href,
  active,
  icon,
  className,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        // Roomier on a phone, where these rows are the whole navigation and
        // the only thing anyone taps; tight on desktop, where the rail is a
        // dense list beside the conversation.
        "flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm transition-colors duration-150 md:py-1.5",
        active
          ? "bg-accent-subtle font-medium text-accent-text"
          : "text-text-secondary hover:bg-surface-sunken hover:text-foreground",
        className
      )}
    >
      <span className={cn("shrink-0", active ? "text-accent-text" : "text-text-muted")}>{icon}</span>
      {children}
    </Link>
  );
}
