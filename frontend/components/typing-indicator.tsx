// The text is what makes this accessible; the dots are decoration, and they
// only exist because a static "ada is typing" line reads as stale.
export function TypingIndicator({ label }: { label: string }) {
  return (
    <div aria-live="polite" className="flex h-5 items-center gap-2 text-xs text-text-muted">
      {label && (
        <>
          <span aria-hidden="true" className="flex items-center gap-0.5">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-1 w-1 animate-typing-dot rounded-full bg-text-muted"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
          <span>{label}</span>
        </>
      )}
    </div>
  );
}
