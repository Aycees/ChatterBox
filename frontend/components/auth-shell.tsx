import type { ReactNode } from "react";

// Both auth screens are the same object, so they're one component with the
// form slotted in. The line under the wordmark is the only place the app
// says what it is -- worth spending, and worth being specific rather than
// welcoming.
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-raised px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 px-1">
          <p className="text-sm font-semibold tracking-tight text-foreground">ChatterBox</p>
          <p className="mt-1 text-sm text-text-secondary">
            Live rooms where who can read what is enforced by the database, not the app.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h1 className="mb-5 text-lg font-semibold text-foreground">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
