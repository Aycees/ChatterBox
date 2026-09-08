"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { AuthProvider } from "@/lib/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  // useState (not a bare module-level `new QueryClient()`) so each browser
  // tab/session gets its own client instance instead of one shared across
  // whatever Next.js server-renders concurrently -- see the TanStack Query
  // + Next.js App Router setup guide.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
