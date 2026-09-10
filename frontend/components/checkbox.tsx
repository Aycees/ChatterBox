import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { CheckMarkIcon } from "@/components/icons";

// A native checkbox styled with `accent-color` alone only colors its
// *checked* state -- unchecked, the browser still paints its own light grey
// box, which reads as a hole in a dark UI. So the input is stripped with
// appearance-none and the tick is drawn on top via peer-checked.
type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-xs text-text-secondary",
        className
      )}
    >
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          type="checkbox"
          className="peer h-4 w-4 appearance-none rounded border border-border-strong bg-surface transition-colors duration-150 checked:border-accent checked:bg-accent"
          {...props}
        />
        <CheckMarkIcon className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-text-on-brand opacity-0 peer-checked:opacity-100" />
      </span>
      {label}
    </label>
  );
}
