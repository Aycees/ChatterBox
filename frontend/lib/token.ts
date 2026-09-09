// Single point of contact with localStorage so nothing else in the app
// touches it directly. `window` doesn't exist during Next.js's server
// render, so every function here guards for that instead of assuming a
// browser environment.
//
// Also exposes a subscribe function so lib/auth-context.tsx can read this
// as a React external store (useSyncExternalStore): setToken/clearToken
// notify same-tab subscribers directly (localStorage's own "storage" event
// only fires in *other* tabs), and the "storage" listener below covers
// those other tabs -- so logging out in one tab logs every open tab out.

const TOKEN_KEY = "chatterbox_token";
type Listener = () => void;
const listeners = new Set<Listener>();

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  emitChange();
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  emitChange();
}

// React only calls this on the client, never during server rendering, so
// touching `window` unguarded here is safe.
export function subscribeToken(listener: Listener): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function emitChange(): void {
  for (const listener of listeners) listener();
}
