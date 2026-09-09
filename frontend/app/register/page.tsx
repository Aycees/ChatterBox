"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { fieldErrorsFrom, registerSchema, type RegisterInput } from "@/lib/validation";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof RegisterInput, string>>>({});

  const register = useMutation({
    mutationFn: (input: RegisterInput) =>
      apiFetch<User>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    // Spec doesn't auto-login on register (no token comes back from this
    // endpoint anyway, just the created user) -- send them to log in with
    // the credentials they just picked.
    onSuccess: () => router.push("/login"),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const result = registerSchema.safeParse({ username, email, password });
    if (!result.success) {
      setFieldErrors(fieldErrorsFrom(result.error));
      return;
    }

    setFieldErrors({});
    register.mutate(result.data);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-950"
      >
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Create an account</h1>

        <div className="space-y-1">
          <label htmlFor="username" className="text-sm text-zinc-600 dark:text-zinc-400">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setFieldErrors((prev) => ({ ...prev, username: undefined }));
            }}
            className="w-full rounded border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
          {fieldErrors.username && (
            <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.username}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-zinc-600 dark:text-zinc-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
            className="w-full rounded border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
          {fieldErrors.email && <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.email}</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-zinc-600 dark:text-zinc-400">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            className="w-full rounded border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
          {fieldErrors.password && (
            <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.password}</p>
          )}
        </div>

        {register.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {register.error instanceof ApiError ? register.error.message : "Registration failed"}
          </p>
        )}

        <button
          type="submit"
          disabled={register.isPending}
          className="w-full rounded bg-foreground py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {register.isPending ? "Creating account..." : "Create account"}
        </button>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-black underline dark:text-zinc-50">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
