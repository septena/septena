"use client";

import { useAppConfig } from "@/lib/app-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { mutate } from "swr";

/** Intercepts all rendering when the vault directory is missing or
 *  empty. Shows a setup checklist with the two main bootstrap paths:
 *  copy the example skeleton, or seed demo data. User clicks "Check
 *  again" after they've run the commands — we re-fetch /api/config. */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const config = useAppConfig();

  if (config.vault_exists && config.vault_has_sections) {
    return <>{children}</>;
  }

  return <OnboardingScreen vaultPath={config.paths.vault} exists={config.vault_exists} />;
}

function OnboardingScreen({ vaultPath, exists }: { vaultPath: string; exists: boolean }) {
  const recheck = () => mutate("app-config");

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome to Septena</h1>
        <p className="mt-2 text-muted-foreground">
          {exists
            ? "Your vault directory exists but has no section folders yet. Pick one of the two paths below to get started."
            : "We couldn't find your vault directory. Pick one of the two paths below to get started."}
        </p>
      </section>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Current vault path</CardTitle>
          <CardDescription>Set by <code>SEPTENA_DATA_DIR</code>, or defaults to <code>~/Documents/septena-data</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded bg-muted px-3 py-2 text-sm">{vaultPath}</code>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Option A — Copy the example skeleton</CardTitle>
          <CardDescription>Empty sections, ready for your real logs.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded bg-muted px-3 py-2 text-xs overflow-x-auto">{`cp -R examples/vault/Bases/* "${vaultPath}/"`}</pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Creates the core three sections — <strong>Exercise</strong>, <strong>Nutrition</strong>, <strong>Habits</strong> — plus Settings. Want more?
            Drop extras from <code>examples/vault/optional/</code> (Supplements, Chores,
            Caffeine, Cannabis) into the same place. Each folder that exists becomes a tab.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Option B — Try it with demo data</CardTitle>
          <CardDescription>30 days of fake meals, sessions, habits, and supplements. Disposable.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded bg-muted px-3 py-2 text-xs overflow-x-auto">{`npm run seed-demo
# then restart the backend with:
SEPTENA_DATA_DIR=/tmp/septena-demo-vault \\
  SEPTENA_INTEGRATIONS_DIR=/tmp/none \\
  uvicorn main:app --port 4445 --reload`}</pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Everything under <code>/tmp/septena-demo-vault</code> — delete the folder when you're done.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={recheck}>Check again</Button>
        <a
          href="https://github.com/septena/septena#quickstart"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Full quickstart in the README →
        </a>
      </div>
    </main>
  );
}
