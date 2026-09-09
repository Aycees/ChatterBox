import { describe, expect, it } from "vitest";
import { fieldErrorsFrom, loginSchema, registerSchema } from "@/lib/validation";

describe("registerSchema", () => {
  it("accepts a well-formed registration", () => {
    const result = registerSchema.safeParse({
      username: "alice",
      email: "alice@example.com",
      password: "correcthorsebattery",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a username under 3 characters", () => {
    const result = registerSchema.safeParse({
      username: "ab",
      email: "alice@example.com",
      password: "correcthorsebattery",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFrom(result.error).username).toMatch(/at least 3/);
    }
  });

  it("rejects a malformed email", () => {
    const result = registerSchema.safeParse({
      username: "alice",
      email: "not-an-email",
      password: "correcthorsebattery",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFrom(result.error).email).toBeDefined();
    }
  });

  it("rejects a password under 8 characters", () => {
    const result = registerSchema.safeParse({
      username: "alice",
      email: "alice@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFrom(result.error).password).toMatch(/at least 8/);
    }
  });
});

describe("loginSchema", () => {
  it("accepts a valid email and any non-empty password", () => {
    const result = loginSchema.safeParse({ email: "alice@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "alice@example.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "x" });
    expect(result.success).toBe(false);
  });
});

describe("fieldErrorsFrom", () => {
  it("reduces every failing field to its first message", () => {
    const result = registerSchema.safeParse({ username: "a", email: "nope", password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrorsFrom(result.error);
      expect(Object.keys(errors).sort()).toEqual(["email", "password", "username"]);
      expect(typeof errors.username).toBe("string");
    }
  });
});
