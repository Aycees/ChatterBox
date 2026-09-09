import { z } from "zod";

// Mirrors the constraints backend/app/schemas/user.py enforces (UserCreate,
// UserLogin). Catching the same problems here means a bad value never
// makes the round trip just to come back as a 422 -- the backend remains
// the actual enforcement boundary, this is purely so the user doesn't wait
// on the network to find out their password is too short.

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be at most 50 characters"),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  // Login only needs to reach the backend to be checked against the
  // stored hash -- no format constraints to mirror here, just "present."
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Reduces a failed safeParse() into { fieldName: firstMessage }, so a form
// can look up `fieldErrors.email` etc. without touching Zod's error shape
// directly.
export function fieldErrorsFrom<T extends Record<string, unknown>>(
  error: z.ZodError<T>
): Partial<Record<keyof T, string>> {
  const fieldErrors = z.flattenError(error).fieldErrors;
  const result: Partial<Record<keyof T, string>> = {};
  for (const key in fieldErrors) {
    const messages = fieldErrors[key];
    if (messages?.[0]) result[key as keyof T] = messages[0];
  }
  return result;
}
