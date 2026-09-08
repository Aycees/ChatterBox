"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getToken } from "@/lib/token";
import { useCurrentUser } from "@/lib/use-current-user";

// Stand-in landing page: just enough to prove register -> login -> "who am
// I" works end-to-end. Replace with the real rooms list in the next slice
// of Phase 5.
export default function Home() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const { data: user, isPending, isError } = useCurrentUser();

  useEffect(() => {
    // `token` (from useSyncExternalStore) reports the server snapshot --
    // always null -- on the very first render after hydration, then
    // corrects itself on a follow-up render once it resyncs with
    // localStorage. This effect fires for *every* render where its
    // dependencies changed, including that first one, so checking only
    // `token` here redirected an already-logged-in user to /login on every
    // hard refresh, before the corrected value ever arrived. getToken()
    // reads localStorage directly and is accurate immediately, since
    // effects only ever run in the browser.
    if (!token && !getToken()) router.replace("/login");
  }, [token, router]);

  if (!token) return null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-black">
      {isPending && <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>}
      {isError && <p className="text-red-600 dark:text-red-400">Couldn&apos;t load your account.</p>}
      {user && (
        <p className="text-black dark:text-zinc-50">
          Logged in as <span className="font-medium">{user.username}</span>
        </p>
      )}
      <button
        type="button"
        onClick={logout}
        className="rounded border border-black/10 px-4 py-2 text-sm dark:border-white/10"
      >
        Log out
      </button>
    </main>
  );
}
