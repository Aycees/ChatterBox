"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { fieldErrorsFrom, registerSchema, type RegisterInput } from "@/lib/validation";
import { Alert } from "@/components/alert";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/button";
import { Field } from "@/components/field";

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
    <AuthShell title="Create an account">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          label="Username"
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          error={fieldErrors.username}
          hint="This is what people see on your messages."
          onChange={(event) => {
            setUsername(event.target.value);
            setFieldErrors((prev) => ({ ...prev, username: undefined }));
          }}
        />

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
          autoComplete="new-password"
          value={password}
          error={fieldErrors.password}
          hint="At least 8 characters."
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
        />

        {register.isError && (
          <Alert>
            {register.error instanceof ApiError
              ? register.error.message
              : "Couldn't create that account. Try again."}
          </Alert>
        )}

        <Button type="submit" disabled={register.isPending} className="w-full">
          {register.isPending ? "Creating account" : "Create account"}
        </Button>

        <p className="text-center text-sm text-text-secondary">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent-text hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
