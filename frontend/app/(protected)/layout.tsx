"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth-context";
import { getToken } from "@/lib/token";
import { RoomRail } from "./room-rail";

// Auth gate for every route nested under this route group -- (protected)
// doesn't add a URL segment, it just lets these routes share this layout
// without /login and /register (siblings, outside the group) getting it
// too. Add a new protected page by dropping it in this folder; it's
// guarded automatically, no per-page wrapper needed.
//
// It's also the app shell: the room rail lives here so it persists across
// navigations instead of being unmounted every time you open a room.
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();

  useEffect(() => {
    // `token` (from useSyncExternalStore) reports the server snapshot --
    // always null -- on the very first render after hydration, then
    // corrects itself on a follow-up render once it resyncs with
    // localStorage. This effect fires for *every* render where its
    // dependencies changed, including that first one, so checking only
    // `token` here would redirect an already-logged-in user to /login on
    // every hard refresh, before the corrected value ever arrived.
    // getToken() reads localStorage directly and is accurate immediately,
    // since effects only ever run in the browser.
    if (!token && !getToken()) router.replace("/login");
  }, [token, router]);

  if (!token) return null;

  // Below md the two panes can't share the viewport, so exactly one shows:
  // the rail at "/", the content pane everywhere else (each content page
  // renders its own back affordance). This is a visibility toggle, not a
  // route change -- both panes stay mounted, so the socket and the rail's
  // caches survive the switch.
  const showRailOnMobile = pathname === "/";

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        className={cn(
          "shrink-0 md:flex md:w-auto",
          showRailOnMobile ? "flex w-full" : "hidden"
        )}
      >
        <RoomRail />
      </aside>
      <main className={cn("min-w-0 flex-1", showRailOnMobile ? "hidden md:flex" : "flex")}>
        {children}
      </main>
    </div>
  );
}
