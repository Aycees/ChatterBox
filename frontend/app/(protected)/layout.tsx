"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { getToken } from "@/lib/token";
import { useCurrentUser } from "@/lib/use-current-user";

// Auth gate for every route nested under this route group -- (protected)
// doesn't add a URL segment, it just lets these routes share this layout
// without /login and /register (siblings, outside the group) getting it
// too. Add a new protected page by dropping it in this folder; it's
// guarded automatically, no per-page wrapper needed.
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { token, logout } = useAuth();
  const { data: user } = useCurrentUser();

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

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-3 dark:border-white/10">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold text-black dark:text-zinc-50">
            ChatterBox
          </Link>
          <Link
            href="/users"
            className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Users
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user && <span className="text-zinc-600 dark:text-zinc-400">{user.username}</span>}
          <button
            type="button"
            onClick={logout}
            className="rounded border border-black/10 px-3 py-1 dark:border-white/10"
          >
            Log out
          </button>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
