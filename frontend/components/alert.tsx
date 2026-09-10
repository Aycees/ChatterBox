import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertIcon, CheckIcon } from "@/components/icons";

// Color alone can't be the only signal that something failed (WCAG 1.4.1),
// so every variant carries an icon as well as a tint.
type AlertProps = {
  variant?: "danger" | "success";
  className?: string;
  children: ReactNode;
};

const variants = {
  danger: "bg-danger-subtle text-danger-text",
  success: "bg-success-subtle text-success-text",
} as const;

export function Alert({ variant = "danger", className, children }: AlertProps) {
  const Icon = variant === "danger" ? AlertIcon : CheckIcon;

  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
        variants[variant],
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
