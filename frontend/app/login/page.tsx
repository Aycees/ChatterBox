"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Token } from "@/lib/types";
import { fieldErrorsFrom, loginSchema, type LoginInput } from "@/lib/validation";
import { Alert } from "@/components/alert";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/button";
import { Field } from "@/components/field";

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
    <AuthShell title="Log in">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          label="Email"
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          error={fieldErrors.email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
        />

        <Field
          label="Password"
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          error={fieldErrors.password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
        />

        {signIn.isError && (
          <Alert>
            {signIn.error instanceof ApiError
              ? signIn.error.message
              : "Couldn't log you in. Try again."}
          </Alert>
        )}

        <Button type="submit" disabled={signIn.isPending} className="w-full">
          {signIn.isPending ? "Logging in" : "Log in"}
        </Button>

        <p className="text-center text-sm text-text-secondary">
          Need an account?{" "}
          <Link href="/register" className="font-medium text-accent-text hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
