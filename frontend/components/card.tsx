import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Containers get rounded-xl, controls get rounded-lg. That split is the only
// radius rule in the system -- the old code mixed bare `rounded` and
// `rounded-lg` with no logic behind which was which.
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface", className)}>{children}</div>
  );
}
