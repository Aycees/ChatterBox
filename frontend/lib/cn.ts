// Minimal class joiner. Not tailwind-merge -- every component here puts its
// own classes first and the caller's `className` last, and callers only pass
// utilities the base doesn't already set, so there's nothing to de-conflict.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
