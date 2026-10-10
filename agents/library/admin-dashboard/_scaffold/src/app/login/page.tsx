"use client";

import { useState, useTransition, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "";
  // Only allow same-origin relative redirects (block //evil.com).
  const safeRedirect =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("That email and password didn't match. Please try again.");
        return;
      }
      // Route by role: owner → dashboard, everyone else → their account.
      const { data: isAdmin } = await supabase.rpc("is_admin");
      const target =
        isAdmin === true
          ? safeRedirect.startsWith("/dashboard")
            ? safeRedirect
            : "/dashboard"
          : safeRedirect && !safeRedirect.startsWith("/dashboard")
            ? safeRedirect
            : "/account";
      router.push(target);
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="card p-8">
        <div className="mb-6 text-center">
          <p className="eyebrow">Sign in</p>
          <h1 className="mt-2 text-2xl font-semibold">Welcome back</h1>
          <p className="mt-2 text-sm text-[color:var(--color-muted)]">
            Sign in to manage your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required className="field"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required className="field"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-[color:var(--color-surface-sink)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={pending}>
            {pending ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Signing in…</>) : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <Suspense fallback={<Loader2 className="h-5 w-5 animate-spin text-[color:var(--color-muted)]" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
