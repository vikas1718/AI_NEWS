import { useNavigate, useRouter, useRouteContext } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabaseUntyped } from "@/lib/supabase-untyped";

type OrganizationSetupFormProps = {
  title?: string;
  description?: string;
  submitLabel?: string;
  successMessage?: string;
};

export function OrganizationSetupForm({
  title = "Create your organization",
  description = "Set up the secure workspace for your newsroom, publication, or media team.",
  submitLabel = "Create organization",
  successMessage = "Organization created. You are now the Owner.",
}: OrganizationSetupFormProps) {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const navigate = useNavigate();
  const router = useRouter();
  const db = supabaseUntyped;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    logo_url: "",
    description: "",
    email: "",
    phone_number: "",
    address: "",
  });

  async function createOrganization(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error("Organization name is required");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name,
        logo_url: form.logo_url,
        description: form.description,
        email: form.email,
        phone_number: form.phone_number,
        address: form.address,
      };

      const organizationId = await createOrganizationInDatabase({
        userId: user.id,
        name: payload.name,
        logo_url: payload.logo_url,
        description: payload.description,
        email: payload.email,
        phone_number: payload.phone_number,
        address: payload.address,
      });

      if (organizationId) {
        window.localStorage.setItem("ai-news-active-organization-id", String(organizationId));
      }

      console.info("[Invitations][organization:create]", {
        organizationId,
        reason: "Organization created in Supabase so future invitations are visible across machines.",
      });

      await router.invalidate();
      toast.success(successMessage);
      navigate({ to: "/team" });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not create organization"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-lg p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-serif text-3xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <form onSubmit={createOrganization} className="mt-8 space-y-5">
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

        <Button type="submit" disabled={loading} className="w-full md:w-auto">
          {loading ? "Creating..." : submitLabel}
        </Button>
      </form>
    </Card>
  );
}

async function createOrganizationInDatabase(input: {
  userId: string;
  name: string;
  logo_url: string;
  description: string;
  email: string;
  phone_number: string;
  address: string;
}) {
  const rpcResult = await supabaseUntyped.rpc("create_organization", {
    p_name: input.name,
    p_logo_url: input.logo_url,
    p_description: input.description,
    p_email: input.email,
    p_phone_number: input.phone_number,
    p_address: input.address,
    p_organization_type: null,
  });

  if (!rpcResult.error) return String(rpcResult.data);
  if (!isMissingCreateOrganizationFunction(rpcResult.error)) throw rpcResult.error;

  const { data: organization, error: organizationError } = await supabaseUntyped
    .from("organizations")
    .insert({
      name: input.name,
      logo_url: input.logo_url || null,
      description: input.description || null,
      email: input.email || null,
      phone_number: input.phone_number || null,
      address: input.address || null,
      organization_type: null,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (organizationError) throw organizationError;

  const organizationId = String(organization.id);
  const { error: membershipError } = await supabaseUntyped.from("organization_members").insert({
    organization_id: organizationId,
    user_id: input.userId,
    role: "owner",
    status: "active",
    invited_by: input.userId,
  });
  if (membershipError) throw membershipError;

  return organizationId;
}

function isMissingCreateOrganizationFunction(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return (
    code === "PGRST202" ||
    (message.includes("create_organization") &&
      (message.includes("schema cache") || message.includes("could not find the function")))
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (isMissingOrganizationSchema(error)) {
    return "Organization database schema is missing in Supabase. Apply supabase/migrations/20260710170000_create_organization_invitation_schema.sql, then reload the app.";
  }

  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function isMissingOrganizationSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message).toLowerCase() : "";
  const code = "code" in error ? String(error.code) : "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (message.includes("schema cache") &&
      (message.includes("public.organizations") ||
        message.includes("organization_members") ||
        message.includes("organization_invitations"))) ||
    message.includes("relation \"public.organizations\" does not exist")
  );
}
