import { clearToken, getToken } from "@/lib/token";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Same origin, ws(s) scheme -- the WebSocket endpoint (spec 5.2) lives on
// this same FastAPI app, just a different protocol.
export const WS_URL = API_URL.replace(/^http/, "ws");

// FastAPI puts the human-readable error in `detail`, either a string
// (HTTPException) or a list of pydantic validation-error objects (422).
// Callers that show `error.message` to the user get something readable
// either way.
export class ApiError extends Error {
  status: number;

  constructor(status: number, detail: unknown) {
    super(ApiError.messageFrom(detail));
    this.name = "ApiError";
    this.status = status;
  }

  private static messageFrom(detail: unknown): string {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((entry) => (entry && typeof entry === "object" && "msg" in entry ? String(entry.msg) : String(entry)))
        .join(", ");
    }
    return "Something went wrong";
  }
}

// Thin wrapper around fetch: resolves the API base URL, attaches the JWT
// (if one is stored) and a JSON content type, and turns a non-2xx response
// into a thrown ApiError instead of a "successful" response the caller has
// to remember to check. Every REST call in the app -- queries and
// mutations alike -- should go through this rather than calling fetch
// directly, so auth and error handling stay in one place.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  // 204 No Content etc. have no body to parse.
  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // 401 here always means "the JWT is missing, invalid, or expired"
    // (backend/app/api/deps.py:get_current_user) -- never "wrong password"
    // (that's a 401 from /auth/login itself, before any token exists, so
    // clearing an already-empty token is a harmless no-op there). Clearing
    // it lets the existing reactive plumbing do the rest: auth-context.tsx
    // reads the token via useSyncExternalStore, so this update propagates
    // to it automatically, and app/(protected)/layout.tsx's guard effect
    // redirects to /login as soon as it sees the token go missing -- no
    // separate "handle session expiry" path needed.
    if (response.status === 401) clearToken();
    throw new ApiError(response.status, body?.detail);
  }

  return body as T;
}
