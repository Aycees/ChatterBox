import { getToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
    throw new ApiError(response.status, body?.detail);
  }

  return body as T;
}
