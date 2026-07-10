import { createFileRoute } from "@tanstack/react-router";
import { Newspaper } from "lucide-react";

import { InvitationsPanel } from "@/components/organization/InvitationsPanel";
import { OrganizationSetupForm } from "@/components/organization/OrganizationSetupForm";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OrganizationOnboarding,
});

function OrganizationOnboarding() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            <span className="font-serif text-lg font-bold">AI News Studio</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <OrganizationSetupForm />

        <div className="space-y-4">
          <InvitationsPanel />
        </div>
      </main>
    </div>
  );
}
