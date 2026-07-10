/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Organization, OrganizationMember, OrganizationRole } from "@/lib/rbac";

type CreateOrganizationInput = {
  name: string;
  logo_url: string | null;
  description: string | null;
  email: string | null;
  phone_number: string | null;
  address: string | null;
};

type OrganizationIdInput = {
  organizationId: string;
};

type InvitationIdInput = {
  invitationId: string;
};

type MemberIdInput = {
  memberId: string;
};

type CreateInvitationInput = {
  organizationId: string;
  email: string;
  role: InviteRole;
};

type SendOrganizationInvitationInput = {
  organizationId: string;
  organizationName: string;
  logo_url: string | null;
  description: string | null;
  organizationEmail: string | null;
  phone_number: string | null;
  address: string | null;
  organization_type: string | null;
  inviteEmail: string;
  role: InviteRole;
};

type ChangeRoleInput = {
  memberId: string;
  role: InviteRole;
};

type BaseResult = { ok: true } | { ok: false; error: string };
type CreateOrganizationResult = { ok: true; organizationId: string } | { ok: false; error: string };
type CreateInvitationResult = { ok: true; invitationId: string } | { ok: false; error: string };
type SendInvitationResult =
  { ok: true; invitationId: string; organizationId: string } | { ok: false; error: string };
type InvitationActionResult = { ok: true; organizationId?: string } | { ok: false; error: string };

type InviteRole = Exclude<OrganizationRole, "owner">;
type InvitationStatus = "pending" | "accepted" | "declined" | "cancelled";

type LocalProfile = {
  id: string;
  email: string;
  full_name: string | null;
  updated_at: string;
};

type LocalInvitation = {
  id: string;
  organization_id: string;
  email: string;
  role: InviteRole;
  status: InvitationStatus;
  invited_by: string;
  invitee_user_id: string | null;
  created_at: string;
  responded_at: string | null;
};

type LocalAuditLog = {
  id: string;
  organization_id: string | null;
  actor_id: string;
  action: string;
  target_table: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type LegacyLocalOrganizationRecord = {
  organization: Organization;
  membership: OrganizationMember;
};

type LocalOrganizationStore = {
  organizations: Record<string, Organization>;
  members: Record<string, OrganizationMember>;
  invitations: Record<string, LocalInvitation>;
  profiles: Record<string, LocalProfile>;
  audit_logs: LocalAuditLog[];
};

export type LocalOrganizationContext = {
  organization: Organization;
  membership: OrganizationMember;
} | null;

export type LocalMemberView = {
  id: string;
  user_id: string;
  role: OrganizationRole;
  status: "active" | "removed" | "suspended";
  joined_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
};

export type LocalSentInvitationView = {
  id: string;
  email: string;
  role: InviteRole;
  status: InvitationStatus;
  created_at: string;
};

export type LocalReceivedInvitationView = {
  id: string;
  email: string;
  role: InviteRole;
  status: InvitationStatus;
  created_at: string;
  organizations: { name: string } | null;
  inviter: { full_name: string | null; email: string } | null;
};

export const getOrganizationBackend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LocalOrganizationContext> => {
    const store = await readStore();
    const profileChanged = upsertProfileFromContext(store, context);
    if (profileChanged) await writeStore(store);
    return getDefaultOrganizationContext(store, context.userId);
  });

export const getPendingInvitationCountBackend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const store = await readStore();
    const email = getContextEmail(context);
    if (!email) return 0;
    return getPendingInvitationsForEmail(store, email).length;
  });

export const getPendingInvitationsBackend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LocalReceivedInvitationView[]> => {
    const store = await readStore();
    const profileChanged = upsertProfileFromContext(store, context);
    const email = getContextEmail(context);
    if (!email) {
      if (profileChanged) await writeStore(store);
      return [];
    }

    const invitations = getPendingInvitationsForEmail(store, email);

    console.info("[Invitations][local-query:result]", {
      authenticatedEmail: email,
      invitationEmail: email,
      returnedInvitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        organizationId: invitation.organization_id,
        source: "local",
      })),
      organizationId: null,
      reason:
        "Local fallback pending invitations filtered only by authenticated email and status=pending.",
    });

    if (profileChanged) await writeStore(store);

    return invitations.map((invitation) => receivedInvitationView(store, invitation));
  });

export const createOrganizationBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): CreateOrganizationInput => {
    const input = isRecord(data) ? data : {};
    return {
      name: cleanString(input.name) ?? "",
      logo_url: cleanString(input.logo_url),
      description: cleanString(input.description),
      email: cleanString(input.email),
      phone_number: cleanString(input.phone_number),
      address: cleanString(input.address),
    };
  })
  .handler(async ({ data, context }): Promise<CreateOrganizationResult> => {
    if (!data.name) {
      return { ok: false, error: "Organization name is required" };
    }

    try {
      const store = await readStore();
      upsertProfileFromContext(store, context);

      const existing = getDefaultOrganizationContext(store, context.userId);
      if (existing?.membership.role === "owner") {
        return { ok: true, organizationId: existing.organization.id };
      }

      const now = new Date().toISOString();
      const organizationId = `local_${crypto.randomUUID()}`;
      const organization: Organization = {
        id: organizationId,
        name: data.name,
        logo_url: data.logo_url,
        description: data.description,
        email: data.email,
        phone_number: data.phone_number,
        address: data.address,
        organization_type: null,
        created_by: context.userId,
        created_at: now,
        updated_at: now,
      };
      const membership: OrganizationMember = {
        id: `local_member_${crypto.randomUUID()}`,
        organization_id: organizationId,
        user_id: context.userId,
        role: "owner",
        status: "active",
        invited_by: context.userId,
        joined_at: now,
        created_at: now,
        updated_at: now,
      };

      store.organizations[organizationId] = organization;
      store.members[membership.id] = membership;
      appendAuditLog(store, {
        organizationId,
        actorId: context.userId,
        action: "organization.created",
        targetTable: "organizations",
        targetId: organizationId,
        metadata: { name: data.name },
      });
      await writeStore(store);
      return { ok: true, organizationId };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not create organization") };
    }
  });

export const updateOrganizationBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): CreateOrganizationInput => {
    const input = isRecord(data) ? data : {};
    return {
      name: cleanString(input.name) ?? "",
      logo_url: cleanString(input.logo_url),
      description: cleanString(input.description),
      email: cleanString(input.email),
      phone_number: cleanString(input.phone_number),
      address: cleanString(input.address),
    };
  })
  .handler(async ({ data, context }): Promise<CreateOrganizationResult> => {
    if (!data.name) {
      return { ok: false, error: "Organization name is required" };
    }

    try {
      const store = await readStore();
      upsertProfileFromContext(store, context);
      const current = getDefaultOrganizationContext(store, context.userId);
      if (!current) {
        return { ok: false, error: "No organization found for this user." };
      }
      if (current.membership.role !== "owner") {
        return {
          ok: false,
          error: "Only the Organization Owner can update organization settings.",
        };
      }

      const organization = {
        ...current.organization,
        name: data.name,
        logo_url: data.logo_url,
        description: data.description,
        email: data.email,
        phone_number: data.phone_number,
        address: data.address,
        updated_at: new Date().toISOString(),
      };
      store.organizations[organization.id] = organization;
      appendAuditLog(store, {
        organizationId: organization.id,
        actorId: context.userId,
        action: "organization.updated",
        targetTable: "organizations",
        targetId: organization.id,
        metadata: { name: data.name },
      });
      await writeStore(store);
      return { ok: true, organizationId: organization.id };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not update organization") };
    }
  });

export const listOrganizationMembersBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): OrganizationIdInput => {
    const input = isRecord(data) ? data : {};
    return { organizationId: cleanString(input.organizationId) ?? "" };
  })
  .handler(async ({ data, context }): Promise<LocalMemberView[]> => {
    const store = await readStore();
    const profileChanged = upsertProfileFromContext(store, context);
    if (profileChanged) await writeStore(store);
    if (!isActiveMember(store, data.organizationId, context.userId)) {
      return [];
    }
    return Object.values(store.members)
      .filter(
        (member) => member.organization_id === data.organizationId && member.status !== "removed",
      )
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map((member) => memberView(store, member));
  });

export const listOrganizationInvitationsBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): OrganizationIdInput => {
    const input = isRecord(data) ? data : {};
    return { organizationId: cleanString(input.organizationId) ?? "" };
  })
  .handler(async ({ data, context }): Promise<LocalSentInvitationView[]> => {
    const store = await readStore();
    const profileChanged = upsertProfileFromContext(store, context);
    if (profileChanged) await writeStore(store);
    if (!isOrganizationOwner(store, data.organizationId, context.userId)) {
      return [];
    }
    return Object.values(store.invitations)
      .filter((invitation) => invitation.organization_id === data.organizationId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        created_at: invitation.created_at,
      }));
  });

export const createInvitationBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): CreateInvitationInput => {
    const input = isRecord(data) ? data : {};
    return {
      organizationId: cleanString(input.organizationId) ?? "",
      email: normalizeEmail(input.email) ?? "",
      role: parseInviteRole(input.role) ?? "editor",
    };
  })
  .handler(async ({ data, context }): Promise<CreateInvitationResult> => {
    if (!data.organizationId) {
      return { ok: false, error: "Organization is required." };
    }
    if (!isEmail(data.email)) {
      return { ok: false, error: "Enter a valid email address." };
    }

    try {
      const store = await readStore();
      upsertProfileFromContext(store, context);
      const organization = store.organizations[data.organizationId];
      if (!organization) {
        return { ok: false, error: "Organization not found." };
      }
      if (!isOrganizationOwner(store, data.organizationId, context.userId)) {
        return { ok: false, error: "Only the Organization Owner can invite members." };
      }
      if (isEmailAlreadyActiveMember(store, data.organizationId, data.email)) {
        return { ok: false, error: "This email address is already a member of the organization." };
      }

      const existing = Object.values(store.invitations).find(
        (invitation) =>
          invitation.organization_id === data.organizationId &&
          invitation.email === data.email &&
          invitation.status === "pending",
      );
      if (existing) {
        return { ok: true, invitationId: existing.id };
      }

      const matchingProfile = Object.values(store.profiles).find(
        (profile) => profile.email === data.email,
      );
      const now = new Date().toISOString();
      const invitation: LocalInvitation = {
        id: `local_invitation_${crypto.randomUUID()}`,
        organization_id: data.organizationId,
        email: data.email,
        role: data.role,
        status: "pending",
        invited_by: context.userId,
        invitee_user_id: matchingProfile?.id ?? null,
        created_at: now,
        responded_at: null,
      };

      store.invitations[invitation.id] = invitation;
      appendAuditLog(store, {
        organizationId: data.organizationId,
        actorId: context.userId,
        action: "invitation.created",
        targetTable: "organization_invitations",
        targetId: invitation.id,
        metadata: { email: data.email, role: data.role },
      });
      await writeStore(store);
      return { ok: true, invitationId: invitation.id };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not send invitation") };
    }
  });

export const sendOrganizationInvitationBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): SendOrganizationInvitationInput => {
    const input = isRecord(data) ? data : {};
    return {
      organizationId: cleanString(input.organizationId) ?? "",
      organizationName: cleanString(input.organizationName) ?? "",
      logo_url: cleanString(input.logo_url),
      description: cleanString(input.description),
      organizationEmail: cleanString(input.organizationEmail),
      phone_number: cleanString(input.phone_number),
      address: cleanString(input.address),
      organization_type: cleanString(input.organization_type),
      inviteEmail: normalizeEmail(input.inviteEmail) ?? "",
      role: parseInviteRole(input.role) ?? "editor",
    };
  })
  .handler(async ({ data, context }): Promise<SendInvitationResult> => {
    if (!isEmail(data.inviteEmail)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    if (!data.organizationName && !data.organizationId) {
      return { ok: false, error: "Organization is required." };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;
      const authenticatedEmail = getContextEmail(context);
      if (!authenticatedEmail) {
        return { ok: false, error: "Authenticated email is required to send invitations." };
      }

      console.info("[Invitations][server-send:start]", {
        authenticatedEmail,
        invitationEmail: data.inviteEmail,
        organizationId: data.organizationId || null,
        reason:
          "Server-side invitation send; avoids browser RLS/schema-cache failures and stores in Supabase.",
      });

      const organizationId = data.organizationId;
      const store = await readStore();
      const profileChanged = upsertProfileFromContext(store, context);
      const localOrganization = organizationId ? store.organizations[organizationId] : null;
      const localMember = localOrganization
        ? getActiveMember(store, organizationId, context.userId)
        : null;

      if (localOrganization && !localMember) {
        return { ok: false, error: "You are not an active member of this organization." };
      }

      if (localMember && localMember.role !== "owner" && localMember.role !== "chief_editor") {
        return { ok: false, error: "Your role cannot invite organization members." };
      }

      if (data.inviteEmail === authenticatedEmail) {
        return { ok: false, error: "You cannot invite your own account." };
      }

      if (
        localOrganization &&
        isEmailAlreadyActiveMember(store, organizationId, data.inviteEmail)
      ) {
        return {
          ok: false,
          error: "This email address is already a member of the organization.",
        };
      }

      await ensureDatabaseProfile(admin, context);
      const databaseProfile = await getProfileByEmail(admin, data.inviteEmail);
      const localProfile = Object.values(store.profiles).find(
        (profile) => profile.email === data.inviteEmail,
      );
      const inviteeUserId = databaseProfile?.id ?? localProfile?.id ?? null;

      const existingInvitation = await getPendingInvitationByEmail(
        admin,
        organizationId,
        data.inviteEmail,
      );
      if (existingInvitation) {
        console.info("[Invitations][server-send:existing]", {
          authenticatedEmail,
          invitationEmail: data.inviteEmail,
          returnedInvitations: [
            { id: existingInvitation.id, email: data.inviteEmail, organizationId },
          ],
          organizationId,
          reason: "A pending invitation already exists for this email and organization.",
        });

        const mirrorChanged = mirrorSentInvitationToLocalStore(store, {
          invitationId: existingInvitation.id,
          organizationId,
          email: data.inviteEmail,
          role: data.role,
          invitedBy: context.userId,
          inviteeUserId,
          createdAt: existingInvitation.created_at,
        });
        if (profileChanged || mirrorChanged) await writeStore(store);
        return { ok: true, invitationId: existingInvitation.id, organizationId };
      }

      const { data: invitation, error } = await admin
        .from("organization_invitations")
        .insert({
          organization_id: organizationId,
          organization_name: data.organizationName || localOrganization?.name || null,
          email: data.inviteEmail,
          role: data.role,
          invited_by: context.userId,
          invitee_user_id: inviteeUserId,
        })
        .select("id,email,organization_id,created_at")
        .single();
      if (error) throw error;

      const mirrorChanged = mirrorSentInvitationToLocalStore(store, {
        invitationId: invitation.id,
        organizationId,
        email: data.inviteEmail,
        role: data.role,
        invitedBy: context.userId,
        inviteeUserId,
        createdAt: invitation.created_at,
      });
      if (profileChanged || mirrorChanged) await writeStore(store);

      console.info("[Invitations][server-send:stored]", {
        authenticatedEmail,
        invitationEmail: data.inviteEmail,
        returnedInvitations: [
          {
            id: invitation.id,
            email: invitation.email,
            organizationId: invitation.organization_id,
          },
        ],
        organizationId,
        reason: "Invitation stored in Supabase and will be fetched by authenticated email.",
      });

      return { ok: true, invitationId: invitation.id, organizationId };
    } catch (error: unknown) {
      console.error("[Invitations][server-send:error]", error);
      return { ok: false, error: getErrorMessage(error, "Could not send invitation") };
    }
  });

export const acceptInvitationBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): InvitationIdInput => {
    const input = isRecord(data) ? data : {};
    return { invitationId: cleanString(input.invitationId) ?? "" };
  })
  .handler(async ({ data, context }): Promise<InvitationActionResult> => {
    try {
      const store = await readStore();
      upsertProfileFromContext(store, context);
      const invitation = store.invitations[data.invitationId];
      if (!invitation || invitation.status !== "pending") {
        return { ok: false, error: "Invitation not found." };
      }
      if (!invitationBelongsToContext(invitation, context)) {
        return { ok: false, error: "This invitation is not assigned to your email address." };
      }

      const organization = store.organizations[invitation.organization_id];
      if (!organization) {
        return { ok: false, error: "Organization not found." };
      }

      const now = new Date().toISOString();
      const existingMember = getActiveMember(store, invitation.organization_id, context.userId);
      if (!existingMember) {
        const membership: OrganizationMember = {
          id: `local_member_${crypto.randomUUID()}`,
          organization_id: invitation.organization_id,
          user_id: context.userId,
          role: invitation.role,
          status: "active",
          invited_by: invitation.invited_by,
          joined_at: now,
          created_at: now,
          updated_at: now,
        };
        store.members[membership.id] = membership;
      } else if (existingMember.role !== "owner") {
        existingMember.role = invitation.role;
        existingMember.status = "active";
        existingMember.updated_at = now;
        store.members[existingMember.id] = existingMember;
      }

      invitation.status = "accepted";
      invitation.invitee_user_id = context.userId;
      invitation.responded_at = now;
      store.invitations[invitation.id] = invitation;
      appendAuditLog(store, {
        organizationId: invitation.organization_id,
        actorId: context.userId,
        action: "invitation.accepted",
        targetTable: "organization_invitations",
        targetId: invitation.id,
        metadata: { role: invitation.role },
      });
      await writeStore(store);
      return { ok: true, organizationId: organization.id };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not accept invitation") };
    }
  });

export const declineInvitationBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): InvitationIdInput => {
    const input = isRecord(data) ? data : {};
    return { invitationId: cleanString(input.invitationId) ?? "" };
  })
  .handler(async ({ data, context }): Promise<BaseResult> => {
    try {
      const store = await readStore();
      upsertProfileFromContext(store, context);
      const invitation = store.invitations[data.invitationId];
      if (!invitation || invitation.status !== "pending") {
        return { ok: false, error: "Invitation not found." };
      }
      if (!invitationBelongsToContext(invitation, context)) {
        return { ok: false, error: "This invitation is not assigned to your email address." };
      }

      invitation.status = "declined";
      invitation.invitee_user_id = context.userId;
      invitation.responded_at = new Date().toISOString();
      store.invitations[invitation.id] = invitation;
      appendAuditLog(store, {
        organizationId: invitation.organization_id,
        actorId: context.userId,
        action: "invitation.declined",
        targetTable: "organization_invitations",
        targetId: invitation.id,
        metadata: {},
      });
      await writeStore(store);
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not decline invitation") };
    }
  });

export const updateMemberRoleBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): ChangeRoleInput => {
    const input = isRecord(data) ? data : {};
    return {
      memberId: cleanString(input.memberId) ?? "",
      role: parseInviteRole(input.role) ?? "editor",
    };
  })
  .handler(async ({ data, context }): Promise<BaseResult> => {
    try {
      const store = await readStore();
      upsertProfileFromContext(store, context);
      const member = store.members[data.memberId];
      if (!member || member.status === "removed") {
        return { ok: false, error: "Member not found." };
      }
      if (!isOrganizationOwner(store, member.organization_id, context.userId)) {
        return { ok: false, error: "Only the Organization Owner can change roles." };
      }
      if (member.role === "owner") {
        return { ok: false, error: "The Owner role cannot be changed." };
      }

      member.role = data.role;
      member.updated_at = new Date().toISOString();
      store.members[member.id] = member;
      appendAuditLog(store, {
        organizationId: member.organization_id,
        actorId: context.userId,
        action: "member.role_changed",
        targetTable: "organization_members",
        targetId: member.id,
        metadata: { role: data.role },
      });
      await writeStore(store);
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not update role") };
    }
  });

export const removeMemberBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): MemberIdInput => {
    const input = isRecord(data) ? data : {};
    return { memberId: cleanString(input.memberId) ?? "" };
  })
  .handler(async ({ data, context }): Promise<BaseResult> => {
    try {
      const store = await readStore();
      upsertProfileFromContext(store, context);
      const member = store.members[data.memberId];
      if (!member || member.status === "removed") {
        return { ok: false, error: "Member not found." };
      }
      if (!isOrganizationOwner(store, member.organization_id, context.userId)) {
        return { ok: false, error: "Only the Organization Owner can remove members." };
      }
      if (member.role === "owner") {
        return { ok: false, error: "The Organization Owner cannot be removed." };
      }

      member.status = "removed";
      member.updated_at = new Date().toISOString();
      store.members[member.id] = member;
      appendAuditLog(store, {
        organizationId: member.organization_id,
        actorId: context.userId,
        action: "member.removed",
        targetTable: "organization_members",
        targetId: member.id,
        metadata: {},
      });
      await writeStore(store);
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not remove member") };
    }
  });

export const leaveOrganizationBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BaseResult> => {
    try {
      const store = await readStore();
      upsertProfileFromContext(store, context);
      const current = getDefaultOrganizationContext(store, context.userId);
      if (!current) return { ok: true };

      const member = store.members[current.membership.id];
      if (!member || member.status !== "active") return { ok: true };

      member.status = "removed";
      member.updated_at = new Date().toISOString();
      store.members[member.id] = member;

      appendAuditLog(store, {
        organizationId: member.organization_id,
        actorId: context.userId,
        action: "member.left",
        targetTable: "organization_members",
        targetId: member.id,
        metadata: {},
      });

      await writeStore(store);
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not leave organization") };
    }
  });

export const deleteAccountBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BaseResult> => {
    try {
      const email = normalizeEmail(context.claims?.email);
      await cleanupLocalAccount(context.userId, email);
      await cleanupSupabaseAccount(context.userId, email);
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, error: getErrorMessage(error, "Could not delete account") };
    }
  });

async function ensureDatabaseProfile(admin: any, context: any) {
  const email = getContextEmail(context);
  if (!email) throw new Error("Authenticated email is required.");

  const { error } = await admin.from("profiles").upsert(
    {
      id: context.userId,
      email,
      full_name: getContextFullName(context) ?? email,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

async function getProfileByEmail(admin: any, email: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; email: string } | null;
}

async function getPendingInvitationByEmail(admin: any, organizationId: string, email: string) {
  const { data, error } = await admin
    .from("organization_invitations")
    .select("id,created_at")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; created_at: string } | null;
}

function mirrorSentInvitationToLocalStore(
  store: LocalOrganizationStore,
  input: {
    invitationId: string;
    organizationId: string;
    email: string;
    role: InviteRole;
    invitedBy: string;
    inviteeUserId: string | null;
    createdAt: string;
  },
) {
  if (!store.organizations[input.organizationId]) return false;

  const existing = store.invitations[input.invitationId];
  if (existing && existing.status !== "pending") return false;

  store.invitations[input.invitationId] = {
    id: input.invitationId,
    organization_id: input.organizationId,
    email: input.email,
    role: input.role,
    status: "pending",
    invited_by: input.invitedBy,
    invitee_user_id: input.inviteeUserId,
    created_at: existing?.created_at ?? input.createdAt,
    responded_at: null,
  };

  if (!existing) {
    appendAuditLog(store, {
      organizationId: input.organizationId,
      actorId: input.invitedBy,
      action: "invitation.created",
      targetTable: "organization_invitations",
      targetId: input.invitationId,
      metadata: { email: input.email, role: input.role, mirrored_from: "supabase" },
    });
  }

  return true;
}

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

async function cleanupLocalAccount(userId: string, email: string | null) {
  const store = await readStore();
  let changed = false;
  const now = new Date().toISOString();

  if (store.profiles[userId]) {
    delete store.profiles[userId];
    changed = true;
  }

  for (const member of Object.values(store.members)) {
    if (member.user_id !== userId || member.status !== "active") continue;
    member.status = "removed";
    member.updated_at = now;
    store.members[member.id] = member;
    changed = true;

    appendAuditLog(store, {
      organizationId: member.organization_id,
      actorId: userId,
      action: "member.left",
      targetTable: "organization_members",
      targetId: member.id,
      metadata: { reason: "account_deleted" },
    });
  }

  for (const invitation of Object.values(store.invitations)) {
    const matchesUser = invitation.invitee_user_id === userId;
    const matchesEmail = Boolean(email && invitation.email === email);
    if (invitation.status !== "pending" || (!matchesUser && !matchesEmail)) continue;

    invitation.status = "cancelled";
    invitation.invitee_user_id = null;
    invitation.responded_at = now;
    store.invitations[invitation.id] = invitation;
    changed = true;
  }

  for (const organization of Object.values(store.organizations)) {
    if (organization.created_by !== userId) continue;

    const hasActiveMembers = Object.values(store.members).some(
      (member) => member.organization_id === organization.id && member.status === "active",
    );
    if (hasActiveMembers) continue;

    delete store.organizations[organization.id];
    for (const [memberId, member] of Object.entries(store.members)) {
      if (member.organization_id === organization.id) delete store.members[memberId];
    }
    for (const [invitationId, invitation] of Object.entries(store.invitations)) {
      if (invitation.organization_id === organization.id) delete store.invitations[invitationId];
    }
    store.audit_logs = store.audit_logs.filter((log) => log.organization_id !== organization.id);
    changed = true;
  }

  if (changed) await writeStore(store);
}

function getDefaultOrganizationContext(
  store: LocalOrganizationStore,
  userId: string,
): LocalOrganizationContext {
  const membership = Object.values(store.members)
    .filter((member) => member.user_id === userId && member.status === "active")
    .sort((a, b) => {
      if (a.role === "owner" && b.role !== "owner") return -1;
      if (a.role !== "owner" && b.role === "owner") return 1;
      return a.joined_at.localeCompare(b.joined_at);
    })[0];

  const organization = membership ? store.organizations[membership.organization_id] : null;
  return membership && organization ? { organization, membership } : null;
}

function getActiveMember(
  store: LocalOrganizationStore,
  organizationId: string,
  userId: string,
): OrganizationMember | null {
  return (
    Object.values(store.members).find(
      (member) =>
        member.organization_id === organizationId &&
        member.user_id === userId &&
        member.status === "active",
    ) ?? null
  );
}

function isActiveMember(store: LocalOrganizationStore, organizationId: string, userId: string) {
  return Boolean(getActiveMember(store, organizationId, userId));
}

function isOrganizationOwner(
  store: LocalOrganizationStore,
  organizationId: string,
  userId: string,
) {
  return getActiveMember(store, organizationId, userId)?.role === "owner";
}

function isEmailAlreadyActiveMember(
  store: LocalOrganizationStore,
  organizationId: string,
  email: string,
) {
  return Object.values(store.members).some((member) => {
    if (member.organization_id !== organizationId || member.status !== "active") return false;
    return store.profiles[member.user_id]?.email === email;
  });
}

function getPendingInvitationsForEmail(store: LocalOrganizationStore, email: string) {
  return Object.values(store.invitations)
    .filter((invitation) => invitation.status === "pending" && invitation.email === email)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function invitationBelongsToContext(invitation: LocalInvitation, context: any) {
  const email = getContextEmail(context);
  return Boolean(email && invitation.email === email);
}

function memberView(store: LocalOrganizationStore, member: OrganizationMember): LocalMemberView {
  const profile = store.profiles[member.user_id];
  return {
    id: member.id,
    user_id: member.user_id,
    role: member.role,
    status: member.status,
    joined_at: member.joined_at,
    profiles: profile
      ? {
          full_name: profile.full_name,
          email: profile.email,
        }
      : {
          full_name: null,
          email: "Unknown user",
        },
  };
}

function receivedInvitationView(
  store: LocalOrganizationStore,
  invitation: LocalInvitation,
): LocalReceivedInvitationView {
  const organization = store.organizations[invitation.organization_id];
  const inviter = store.profiles[invitation.invited_by];
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    created_at: invitation.created_at,
    organizations: organization ? { name: organization.name } : null,
    inviter: inviter ? { full_name: inviter.full_name, email: inviter.email } : null,
  };
}

function upsertProfileFromContext(store: LocalOrganizationStore, context: any) {
  const email = getContextEmail(context);
  const fullName = getContextFullName(context);
  const existing = store.profiles[context.userId];
  if (!email && !fullName && existing) return false;

  const next: LocalProfile = {
    id: context.userId,
    email: email ?? existing?.email ?? "",
    full_name: fullName ?? existing?.full_name ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing && existing.email === next.email && existing.full_name === next.full_name) {
    return false;
  }

  store.profiles[context.userId] = next;
  return true;
}

function getContextEmail(context: any) {
  return normalizeEmail(context?.claims?.email);
}

function getContextFullName(context: any) {
  const metadata = context?.claims?.user_metadata;
  return (
    cleanString(metadata?.full_name) ??
    cleanString(metadata?.name) ??
    cleanString(context?.claims?.name)
  );
}

function appendAuditLog(
  store: LocalOrganizationStore,
  input: {
    organizationId: string | null;
    actorId: string;
    action: string;
    targetTable: string;
    targetId: string;
    metadata: Record<string, unknown>;
  },
) {
  store.audit_logs.push({
    id: `local_audit_${crypto.randomUUID()}`,
    organization_id: input.organizationId,
    actor_id: input.actorId,
    action: input.action,
    target_table: input.targetTable,
    target_id: input.targetId,
    metadata: input.metadata,
    created_at: new Date().toISOString(),
  });
}

function parseInviteRole(value: unknown): InviteRole | null {
  return value === "chief_editor" || value === "editor" ? value : null;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function normalizeEmail(value: unknown) {
  const email = cleanString(value);
  return email ? email.toLowerCase() : null;
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

async function readStore(): Promise<LocalOrganizationStore> {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(await getStorePath(), "utf-8");
    return normalizeStore(JSON.parse(raw));
  } catch (error: any) {
    if (error?.code === "ENOENT") return emptyStore();
    throw error;
  }
}

async function writeStore(store: LocalOrganizationStore) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const path = await getStorePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), "utf-8");
}

async function getStorePath() {
  const { join } = await import("node:path");
  return join(process.cwd(), ".local-backend", "organizations.json");
}

function normalizeStore(parsed: unknown): LocalOrganizationStore {
  const store = emptyStore();
  if (!isRecord(parsed)) return store;

  if (isRecord(parsed.organizations)) {
    store.organizations = parsed.organizations as Record<string, Organization>;
  }
  if (isRecord(parsed.members)) {
    store.members = parsed.members as Record<string, OrganizationMember>;
  }
  if (isRecord(parsed.invitations)) {
    store.invitations = parsed.invitations as Record<string, LocalInvitation>;
  }
  if (isRecord(parsed.profiles)) {
    store.profiles = parsed.profiles as Record<string, LocalProfile>;
  }
  if (Array.isArray(parsed.audit_logs)) {
    store.audit_logs = parsed.audit_logs as LocalAuditLog[];
  }

  if (isRecord(parsed.users)) {
    for (const [userId, value] of Object.entries(parsed.users)) {
      if (!isRecord(value)) continue;
      const legacy = value as LegacyLocalOrganizationRecord;
      if (legacy.organization?.id) {
        store.organizations[legacy.organization.id] = legacy.organization;
      }
      if (legacy.membership?.id) {
        store.members[legacy.membership.id] = legacy.membership;
      }
      if (!store.profiles[userId]) {
        store.profiles[userId] = {
          id: userId,
          email: "",
          full_name: null,
          updated_at: new Date().toISOString(),
        };
      }
    }
  }

  return store;
}

function emptyStore(): LocalOrganizationStore {
  return {
    organizations: {},
    members: {},
    invitations: {},
    profiles: {},
    audit_logs: [],
  };
}
