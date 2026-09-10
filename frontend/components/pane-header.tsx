"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";

// Every content pane gets the same 56px header so the shell reads as one
// app rather than three pages. `back` only appears below md, where the rail
// isn't on screen to navigate from.
type PaneHeaderProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
};

export function PaneHeader({ icon, title, subtitle, trailing }: PaneHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 md:px-5">
      <Link
        href="/"
        aria-label="Back to rooms"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors duration-150 hover:bg-surface-raised hover:text-foreground md:hidden"
      >
        <ChevronLeftIcon />
      </Link>
      {icon && <span className="shrink-0 text-text-muted">{icon}</span>}
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="truncate text-xs text-text-secondary">{subtitle}</p>}
      </div>
      {trailing && <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div>}
    </header>
  );
}
