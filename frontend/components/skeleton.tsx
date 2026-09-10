import { cn } from "@/lib/cn";

// Shaped like the content it stands in for, so a slow list reads as loading
// rather than as an empty result.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-raised", className)} />;
}

export function RoomRowSkeleton() {
  return (
    <div className="space-y-1 px-2 py-1">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-8 w-3/5" />
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2.5">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-12 w-56 rounded-2xl" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-9 w-40 rounded-2xl" />
      </div>
      <div className="flex gap-2.5">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-9 w-44 rounded-2xl" />
      </div>
    </div>
  );
}
