import type { ReactNode } from "react";

// An empty screen is an invitation to act, not a shrug -- so the shape is
// always mark, then what's true, then what to do about it.
type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-raised text-text-secondary">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-text-secondary">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
