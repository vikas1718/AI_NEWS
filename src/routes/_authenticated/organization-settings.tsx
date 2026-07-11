import { createFileRoute, redirect, useRouteContext, useRouter } from "@tanstack/react-router";
import { Building2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission } from "@/lib/rbac";
import { supabaseUntyped } from "@/lib/supabase-untyped";

export const Route = createFileRoute("/_authenticated/organization-settings")({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.permissions, "organization_settings")) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: OrganizationSettings,
});

function OrganizationSettings() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const router = useRouter();
  const db = supabaseUntyped;
  const organization = ctx.organization!;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: organization.name,
    logo_url: organization.logo_url ?? "",
    description: organization.description ?? "",
    email: organization.email ?? "",
    phone_number: organization.phone_number ?? "",
    address: organization.address ?? "",
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error("Organization name is required");
      return;
    }

    setLoading(true);
    try {
      const { error } = await db
        .from("organizations")
        .update({
          name,
          logo_url: form.logo_url || null,
          description: form.description || null,
          email: form.email || null,
          phone_number: form.phone_number || null,
          address: form.address || null,
          organization_type: null,
        })
        .eq("id", organization.id);
      if (error) throw error;

      await router.invalidate();
      toast.success("Organization settings updated");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not update organization");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
          <Building2 className="h-4 w-4" />
          Organization Settings
        </div>
        <h1 className="mt-1 font-serif text-3xl font-bold">{organization.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the workspace profile used by your newsroom team.
        </p>
      </div>

      <Card className="rounded-lg p-6">
        <form onSubmit={save} className="space-y-5">
          <div className="space-y-1.5">
            <Label>Organization name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Organization logo</Label>
            <Input
              type="url"
              placeholder="https://example.com/logo.png"
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Organization description</Label>
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Organization email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Organization phone number</Label>
              <Input
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Organization address</Label>
            <Textarea
              rows={3}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>

          <Button type="submit" disabled={loading}>
            <Save className="h-4 w-4" />
            {loading ? "Saving..." : "Save settings"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
