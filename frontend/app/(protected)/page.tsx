"use client";

import { InviteList } from "@/components/invite-list";
import { PaneHeader } from "@/components/pane-header";
import { MailIcon } from "@/components/icons";

// "/" is now the home pane of the shell rather than the room list -- the
// rooms moved into the persistent rail. What's left here is the one thing
// that needed room to breathe: invitations you haven't answered.
export default function HomePage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PaneHeader title="Invitations" icon={<MailIcon />} />

      <div className="scroll-thin flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 md:px-6">
          <InviteList />
        </div>
      </div>
    </div>
  );
}
