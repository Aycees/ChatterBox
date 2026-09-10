import { cn } from "@/lib/cn";
import { initial } from "@/lib/format";

// Decorative: every place an avatar appears, the username is rendered as
// real text beside it, so the initial adds nothing for a screen reader.
// One flat accent-subtle fill rather than a per-user hue -- a hashed color
// ramp buys very little and needs a stable hash to be worth anything.

type AvatarProps = {
  username: string;
  size?: "sm" | "md";
  online?: boolean;
  className?: string;
};

const sizes = {
  sm: "h-7 w-7 text-xs",
  md: "h-8 w-8 text-sm",
} as const;

export function Avatar({ username, size = "sm", online, className }: AvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full bg-accent-subtle font-medium text-accent-text",
          sizes[size]
        )}
      >
        {initial(username)}
      </span>
      {online && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-success"
        />
      )}
    </span>
  );
}
