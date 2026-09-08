import { afterEach, describe, expect, it, vi } from "vitest";
import { clearToken, getToken, setToken, subscribeToken } from "@/lib/token";

afterEach(() => {
  window.localStorage.clear();
});

describe("token storage", () => {
  it("returns null when nothing is stored", () => {
    expect(getToken()).toBeNull();
  });

  it("round-trips a token through set/get/clear", () => {
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");

    clearToken();
    expect(getToken()).toBeNull();
  });

  it("notifies same-tab subscribers on set and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToken(listener);

    setToken("a-token");
    clearToken();

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("stops notifying once unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToken(listener);
    unsubscribe();

    setToken("a-token");

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies subscribers on a cross-tab storage event for this key, but not for others", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToken(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "chatterbox_token" }));
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new StorageEvent("storage", { key: "some_other_key" }));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
