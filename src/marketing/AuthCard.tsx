"use client";
// Sign in / sign up shell. There is no account system yet, so submitting takes you straight into
// the agents workspace — and the card says so, rather than pretending to authenticate.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { AUTH } from "./content";
import { Button } from "./Button";
import { Icon } from "./icons";
import { Logo } from "./Nav";

const field =
  "mt-1.5 w-full rounded-control border border-border bg-input px-3 py-2.5 text-body text-foreground placeholder:text-muted-foreground/60 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

export function AuthCard({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    router.push("/agents");
  };

  return (
    <main className="grid-field relative flex min-h-screen items-center justify-center px-gutter py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,color-mix(in_oklab,var(--color-safe)_8%,transparent),transparent_45%)]" aria-hidden />
      <div className="animate-reveal relative w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <section className="rounded-panel border border-border bg-surface p-7 shadow-[0_0_80px_color-mix(in_oklab,var(--color-signal)_8%,transparent)]" aria-labelledby={`${id}-title`}>
          <p className="font-label text-label uppercase text-primary">{signup ? "Create your exam room" : "Welcome back"}</p>
          <h1 id={`${id}-title`} className="mt-2 font-heading text-h2 font-medium">{signup ? "Sign up" : "Sign in"}</h1>
          <p className="mt-2 text-caption text-muted-foreground">
            {signup ? "Run your first clean-versus-poisoned shift in minutes." : "Pick up where your last Run left off."}
          </p>

          <form className="mt-7 flex flex-col gap-4" onSubmit={submit} noValidate>
            {signup && (
              <label className="block text-caption font-medium" htmlFor={`${id}-name`}>
                Name
                <input id={`${id}-name`} name="name" autoComplete="name" className={field} placeholder="Ada Lovelace" />
              </label>
            )}
            <label className="block text-caption font-medium" htmlFor={`${id}-email`}>
              Work email
              <input id={`${id}-email`} name="email" type="email" autoComplete="email" className={field} placeholder="you@company.com" />
            </label>
            <label className="block text-caption font-medium" htmlFor={`${id}-password`}>
              Password
              <input id={`${id}-password`} name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} className={field} placeholder="••••••••" />
            </label>
            <Button type="submit" disabled={busy} className="mt-2 w-full">
              {busy ? "Opening your workspace…" : signup ? "Create account" : "Sign in"} <Icon name="arrow-right" className="size-4" />
            </Button>
          </form>

          <p className="mt-5 border-t border-border pt-4 font-label text-label-sm uppercase text-muted-foreground">
            Demo build · accounts are not connected yet. Continuing opens your workspace.
          </p>
        </section>
        <p className="mt-6 text-center text-caption text-muted-foreground">
          {signup ? "Already have an account? " : "New to AgentSim? "}
          <Link href={signup ? AUTH.signin.href : AUTH.signup.href} className="text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {signup ? AUTH.signin.label : AUTH.signup.label}
          </Link>
        </p>
        <p className="mt-3 text-center">
          <Link href="/" className="inline-flex items-center gap-2 font-label text-label uppercase text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <Icon name="arrow-left" className="size-3.5" /> Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
