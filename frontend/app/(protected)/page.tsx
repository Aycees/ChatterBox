"use client";

import { useAuth } from "@/lib/auth-context";
import { useCurrentUser } from "@/lib/use-current-user";

// Stand-in landing page: just enough to prove register -> login -> "who am
// I" works end-to-end. Replace with the real rooms list in the next slice
// of Phase 5. The auth gate itself now lives in this route group's layout.
export default function Home() {
  const { logout } = useAuth();
  const { data: user, isPending, isError } = useCurrentUser();

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
