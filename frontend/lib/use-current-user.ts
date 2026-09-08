"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { User } from "@/lib/types";

// The one place GET /auth/me is called from. Any component that needs to
// know who's logged in should use this hook rather than fetching directly,
// so they all share the same cached result and the same loading/error
// states.
export function useCurrentUser() {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/auth/me"),
    // Only run once a token actually exists -- otherwise this fires on
    // every page load before login, guaranteed to 401.
    enabled: !!token,
    // A 401 here means "not logged in," not "transient network blip," so
    // retrying three times with backoff (the default) is pure wasted time.
    retry: false,
  });
}
