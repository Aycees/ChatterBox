"use client";

import { ApiError } from "@/lib/api";
import { useAcceptInvite, useDeclineInvite, useMyInvites } from "@/lib/use-invites";
import { Alert } from "@/components/alert";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { HashIcon } from "@/components/icons";

// Shared by the home pane and, on mobile only, by the rail -- because on a
// phone the rail *is* the home screen, and an invitation you can see the
// count of but never open is worse than no badge at all.
export function InviteList({ compact = false }: { compact?: boolean }) {
  const invites = useMyInvites();
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();

  const busy = acceptInvite.isPending || declineInvite.isPending;
  const failure = acceptInvite.error ?? declineInvite.error;

  if (invites.isPending) {
    return compact ? null : (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (invites.isError) {
    return compact ? null : <Alert>Couldn&apos;t load your invitations.</Alert>;
  }

  if (!invites.data?.length) {
    return compact ? null : (
      // m-auto so it centers in whatever height the pane has left, rather
      // than sitting stranded near the top of a tall empty column.
      <div className="m-auto">
        <EmptyState
          icon={<HashIcon className="h-5 w-5" />}
          title="Nothing waiting for you"
          description="Open a room from the left to start talking, or create one and invite people to it."
        />
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {invites.data.map((invite) => (
          <li key={invite.id}>
            <Card className="flex flex-wrap items-center gap-3 p-3">
              <Avatar username={invite.invited_by_username} size="md" />
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{invite.invited_by_username}</span> invited you to
                  join
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-text-secondary">
                  <HashIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{invite.room_name}</span>
                </p>
              </div>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => declineInvite.mutate(invite.id)}
                  disabled={busy}
                >
                  Decline
                </Button>
                <Button size="sm" onClick={() => acceptInvite.mutate(invite.id)} disabled={busy}>
                  Accept
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {failure && (
        <Alert className="mt-3">
          {failure instanceof ApiError ? failure.message : "Couldn't update that invitation."}
        </Alert>
      )}
    </>
  );
}
