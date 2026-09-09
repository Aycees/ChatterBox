"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";

// `search` is expected to already be debounced by the caller -- this hook
// just mirrors it straight into the query key/URL, same shape as every
// other query in lib/use-*.ts.
export function useUsers(search: string) {
  return useQuery({
    queryKey: ["users", search],
    queryFn: () =>
      apiFetch<User[]>(`/users${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });
}
