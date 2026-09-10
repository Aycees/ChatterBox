import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// The label + input + error block was repeated seven times across the two
// auth pages. Collapsing it into one component is also what makes the ARIA
// wiring below exist at all -- previously the red error text had no
// programmatic link to the input it described.

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  id: string;
  error?: string;
  hint?: string;
};

export function Field({ label, id, error, hint, className, ...props }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          "w-full rounded-lg border bg-surface-sunken px-3 py-2.5 text-sm text-foreground",
          "placeholder:text-text-muted transition-colors duration-150",
          error ? "border-danger" : "border-border focus:border-accent-text",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-xs text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
