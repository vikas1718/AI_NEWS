import { createFileRoute, useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  Monitor,
  Moon,
  Save,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccountBackend } from "@/lib/organization-backend";
import { roleLabels } from "@/lib/rbac";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { getStoredThemePreference, storeThemePreference, type ThemePreference } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const router = useRouter();
  const navigate = useNavigate();
  const db = supabaseUntyped;
  const deleteAccountServer = useServerFn(deleteAccountBackend);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName:
      ctx.profile?.full_name ??
      cleanString(ctx.user.user_metadata?.full_name) ??
      cleanString(ctx.user.user_metadata?.name) ??
      "",
  });
  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const organization = ctx.organization;
  const membership = ctx.membership;
  const accountEmail = ctx.user.email ?? ctx.profile?.email ?? "";
  const canLeaveOrganization = Boolean(organization && membership && membership.role !== "editor");

  useEffect(() => {
    setTheme(getStoredThemePreference());
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const fullName = profileForm.fullName.trim();
    if (!fullName) {
      toast.error("Name is required.");
      return;
    }

    setProfileSaving(true);
    try {
      const { error: userError } = await supabase.auth.updateUser({
        data: { full_name: fullName },
      });
      if (userError) throw userError;

      const { error: profileError } = await db.from("profiles").upsert(
        {
          id: ctx.user.id,
          email: accountEmail,
          full_name: fullName,
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      await router.invalidate();
      toast.success("Profile updated.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not update profile");
    } finally {
      setProfileSaving(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (passwordForm.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (error) throw error;

      setPasswordForm({ newPassword: "", confirmPassword: "" });
      toast.success("Password updated.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not update password");
    } finally {
      setPasswordSaving(false);
    }
  }

  function changeTheme(value: string) {
    if (!isThemePreference(value)) return;

    setTheme(value);
    storeThemePreference(value);
    toast.success(`Theme set to ${themeLabel(value)}.`);
  }

  async function leaveOrganization() {
    if (!organization || !membership) return;
    if (membership.role === "editor") {
      toast.error("Editors cannot leave the organization. Ask a Chief Editor to remove access.");
      return;
    }

    setLeaving(true);
    try {
      const { error } = await db.rpc("leave_organization", { p_member_id: membership.id });
      if (error) throw error;
      window.localStorage.removeItem("ai-news-active-organization-id");

      await router.invalidate();
      toast.success(`You left ${organization.name}.`);
      navigate({ to: "/dashboard" });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not leave organization");
    } finally {
      setLeaving(false);
    }
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    try {
      const result = await deleteAccountServer();
      if (!result.ok) throw new Error(result.error);

      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      toast.success("Account deleted. Sign up again to create a new account.");
      navigate({ to: "/auth", search: { mode: "signup" }, replace: true });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not delete account");
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
          <UserRound className="h-4 w-4" />
          Settings
        </div>
        <h1 className="mt-1 font-serif text-3xl font-bold">Account settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, password, appearance, and organization access.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="rounded-lg p-6">
            <form onSubmit={saveProfile} className="space-y-5">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="h-4 w-4 text-primary" />
                  Profile
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  This name is shown to organization owners and teammates.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input
                  value={profileForm.fullName}
                  onChange={(e) => setProfileForm({ fullName: e.target.value })}
                  required
                  autoComplete="name"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Email address</Label>
                <Input value={accountEmail} disabled />
              </div>

              <Button type="submit" disabled={profileSaving}>
                <Save className="h-4 w-4" />
                {profileSaving ? "Saving..." : "Save profile"}
              </Button>
            </form>
          </Card>

          <Card className="rounded-lg p-6">
            <form onSubmit={savePassword} className="space-y-5">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <LockKeyhole className="h-4 w-4 text-primary" />
                  Password
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set a new password for signing in with this email.
                </p>
              </div>

              <PasswordInput
                label="New password"
                value={passwordForm.newPassword}
                show={showNewPassword}
                onToggle={() => setShowNewPassword((value) => !value)}
                onChange={(value) => setPasswordForm({ ...passwordForm, newPassword: value })}
              />
              <PasswordInput
                label="Confirm password"
                value={passwordForm.confirmPassword}
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((value) => !value)}
                onChange={(value) => setPasswordForm({ ...passwordForm, confirmPassword: value })}
              />

              <Button type="submit" disabled={passwordSaving}>
                <LockKeyhole className="h-4 w-4" />
                {passwordSaving ? "Updating..." : "Update password"}
              </Button>
            </form>
          </Card>

          <Card className="rounded-lg p-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sun className="h-4 w-4 text-primary" />
                  Appearance
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose how AI News Studio looks on this device.
                </p>
              </div>

              <ToggleGroup
                type="single"
                value={theme}
                onValueChange={changeTheme}
                variant="outline"
                className="grid grid-cols-3 justify-stretch"
              >
                <ToggleGroupItem value="light" className="w-full">
                  <Sun className="h-4 w-4" />
                  Light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" className="w-full">
                  <Moon className="h-4 w-4" />
                  Dark
                </ToggleGroupItem>
                <ToggleGroupItem value="system" className="w-full">
                  <Monitor className="h-4 w-4" />
                  System
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-lg p-6">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-primary" />
                Organization
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                This account is tied to one organization workspace. Use a different account for a
                different organization.
              </p>
            </div>
            {organization && membership ? (
              <div className="mt-4 rounded-lg border border-primary bg-primary/10 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{organization.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Current role: {roleLabels[membership.role]}
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                You are not currently a member of an organization.
              </p>
            )}
          </Card>

          {canLeaveOrganization && (
            <Card className="rounded-lg border-destructive/30 p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Leave organization
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Leaving removes your active membership. You will lose access to organization editions,
                review pages, team management, and organization settings.
              </p>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!organization || !membership || leaving}
                    className="mt-5 w-full"
                  >
                    {leaving ? "Leaving..." : "Leave organization"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave {organization?.name ?? "organization"}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your membership will be removed immediately. You can still sign in, but
                      organization pages will be restricted until an owner gives this account access again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={leaveOrganization}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={leaving}
                    >
                      Leave organization
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          )}

          <Card className="rounded-lg border-destructive/30 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete account
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Permanently delete your sign-in account and remove your organization access. Signing
              up again with the same email starts as a new account.
            </p>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletingAccount}
                  className="mt-5 w-full"
                >
                  {deletingAccount ? "Deleting..." : "Delete my account"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes your login account. You will leave every organization,
                    old invitations for this email will be cancelled, and you must sign up again to
                    use AI News Studio.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deletingAccount}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={deleteAccount}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deletingAccount}
                  >
                    Delete account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  show,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          title={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isThemePreference(value: string): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function themeLabel(value: ThemePreference) {
  if (value === "system") return "system";
  return value;
}
