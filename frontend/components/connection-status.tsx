import type { ConnectionState } from "@/lib/use-room-socket";
import { cn } from "@/lib/cn";

// Was plain grey text that said "Disconnected" as quietly as it said
// "3 online". Now the three states are told apart by color, a dot, and a
// live region, since a dropped socket is the one thing in this UI a user
// most needs to notice.

type ConnectionStatusProps = {
  state: ConnectionState;
  onlineCount: number;
};

export function ConnectionStatus({ state, onlineCount }: ConnectionStatusProps) {
  const config = {
    open: {
      className: "bg-success-subtle text-success-text",
      dot: "bg-success-text",
      label: `${onlineCount} online`,
    },
    connecting: {
      className: "bg-warning-subtle text-warning-text",
      dot: "bg-warning-text animate-pulse",
      label: "Connecting",
    },
    closed: {
      className: "bg-danger-subtle text-danger-text",
      dot: "bg-danger-text",
      label: "Disconnected",
    },
  }[state];

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        config.className
      )}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
