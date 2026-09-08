"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Token } from "@/lib/types";
import { fieldErrorsFrom, loginSchema, type LoginInput } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof LoginInput, string>>>({});

  const signIn = useMutation({
    mutationFn: (input: LoginInput) =>
      apiFetch<Token>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (token) => {
      login(token.access_token);
      // TODO: once the rooms list exists, this should go there instead --
      // "/" is a stand-in just to prove the token round-trips.
      router.push("/");
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setFieldErrors(fieldErrorsFrom(result.error));
      return;
    }

    setFieldErrors({});
    signIn.mutate(result.data);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-950"
      >
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Log in</h1>

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

        {signIn.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {signIn.error instanceof ApiError ? signIn.error.message : "Login failed"}
          </p>
        )}

        <button
          type="submit"
          disabled={signIn.isPending}
          className="w-full rounded bg-foreground py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {signIn.isPending ? "Logging in..." : "Log in"}
        </button>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Need an account?{" "}
          <Link href="/register" className="font-medium text-black underline dark:text-zinc-50">
            Register
          </Link>
        </p>
      </form>
    </main>
  );
}
