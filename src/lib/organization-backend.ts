import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type BaseResult = { ok: true } | { ok: false; error: string };

export const deleteAccountBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BaseResult> => {
    try {
      const email = normalizeEmail(context.claims?.email);
      await cleanupSupabaseAccount(context.userId, email);
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not delete account") };
    }
  });

async function cleanupSupabaseAccount(userId: string, email: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const now = new Date().toISOString();

  await runOptionalOrganizationCleanup(
    admin
      .from("organization_members")
      .update({ status: "removed", updated_at: now })
      .eq("user_id", userId)
      .eq("status", "active"),
  );

  const invitationUpdate = {
    status: "cancelled",
    invitee_user_id: null,
    responded_at: now,
  };

  await runOptionalOrganizationCleanup(
    admin
      .from("organization_invitations")
      .update(invitationUpdate)
      .eq("status", "pending")
      .eq("invitee_user_id", userId),
  );

  if (email) {
    await runOptionalOrganizationCleanup(
      admin
        .from("organization_invitations")
        .update(invitationUpdate)
        .eq("status", "pending")
        .eq("email", email),
    );
  }

  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) throw error;
}

async function runOptionalOrganizationCleanup(query: PromiseLike<{ error: unknown }>) {
  const { error } = await query;
  if (error && !isMissingDatabaseObjectError(error)) throw error;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email || null;
}

function getErrorMessage(error: unknown, fallback: string) {
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

function isMissingDatabaseObjectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message).toLowerCase() : "";
  const code = "code" in error ? String(error.code) : "";
  return code === "42P01" || message.includes("schema cache") || message.includes("does not exist");
}
