import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Replaces the near-identical `rounded bg-foreground px-4 py-2 ...` string
// that was hand-written in eight places. Every primary action in the app now
// resolves to one accent color from one file.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium " +
  "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";

const variants = {
  primary: "bg-accent text-text-on-brand hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "border border-border bg-surface text-foreground hover:bg-surface-raised hover:border-border-strong",
  ghost: "text-text-secondary hover:bg-surface-raised hover:text-foreground",
  danger: "bg-danger text-white hover:opacity-90",
} as const;

// md clears the 40px touch target the design system asks for; sm is for
// inline row actions (Join, Load older) that aren't primary mobile targets.
const sizes = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
