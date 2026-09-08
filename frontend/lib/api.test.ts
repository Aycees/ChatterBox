import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { clearToken, setToken } from "@/lib/token";

function fakeResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  clearToken();
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("returns the parsed JSON body on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { hello: "world" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ hello: string }>("/anything");

    expect(result).toEqual({ hello: "world" });
  });

  it("returns undefined for a 204 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(204, null));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("/anything");

    expect(result).toBeUndefined();
  });

  it("omits the Authorization header when there's no stored token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/anything");

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.has("Authorization")).toBe(false);
  });

  it("attaches a Bearer Authorization header when a token is stored", async () => {
    setToken("my-jwt");
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/anything");

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer my-jwt");
  });

  it("throws an ApiError with the string detail from a plain HTTPException", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse(409, { detail: "A user with that username or email already exists" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/auth/register")).rejects.toMatchObject({
      status: 409,
      message: "A user with that username or email already exists",
    });
  });

  it("joins a 422 validation-error array into one readable message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(422, {
        detail: [
          { loc: ["body", "email"], msg: "field required", type: "missing" },
          { loc: ["body", "password"], msg: "string too short", type: "too_short" },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/auth/register")).rejects.toMatchObject({
      status: 422,
      message: "field required, string too short",
    });
  });

  it("throws an ApiError instance so callers can narrow with instanceof", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(401, { detail: "nope" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/anything")).rejects.toBeInstanceOf(ApiError);
  });
});
