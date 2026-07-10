import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Newspaper } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const search = z.object({ mode: z.enum(["signin", "signup", "recovery"]).optional() });
type AuthTab = "signin" | "signup";
type RecoveryStep = "idle" | "request" | "reset";

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => search.parse(s),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AuthTab>(mode === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>(
    mode === "recovery" ? "reset" : "idle",
  );
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recoverySessionReady, setRecoverySessionReady] = useState(mode === "recovery");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const recoveryUrl =
      mode === "recovery" ||
      window.location.hash.includes("type=recovery") ||
      window.location.search.includes("type=recovery") ||
      window.location.hash.includes("access_token=") ||
      window.location.search.includes("code=") ||
      window.location.search.includes("token_hash=");
    const recoverySession = sessionStorage.getItem("ai-news-password-recovery") === "1";
    if (recoveryUrl || recoverySession) {
      sessionStorage.removeItem("ai-news-password-recovery");
      setTab("signin");
      setRecoveryStep("reset");
      setRecoverySessionReady(true);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setSignedInEmail(data.user?.email ?? null);
      if (data.user && mode !== "signup") navigate({ to: "/dashboard" });
    });
  }, [mode, navigate]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setTab("signin");
        setEmail(session?.user.email ?? "");
        setRecoveryStep("reset");
        setRecoverySessionReady(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (tab === "signup") {
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession.session) {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) throw signOutError;
        }

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;

        if (data.user && data.user.identities?.length === 0) {
          toast.error("An account already exists for this email. Please sign in instead.");
          setTab("signin");
          return;
        }

        if (!data.session) {
          toast.success("Account created. Check your email to confirm it, then sign in.");
          setTab("signin");
          setPassword("");
          return;
        }

        toast.success("Account created. Welcome to AI News Studio.");
        setSignedInEmail(normalizedEmail);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
      }

      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  function startRecovery() {
    setTab("signin");
    setPassword("");
    setRecoveryOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setRecoverySessionReady(false);
    setRecoveryStep("request");
  }

  function cancelRecovery() {
    setRecoveryStep("idle");
    setRecoveryOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setRecoverySessionReady(false);
  }

  async function sendRecoveryOtp() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Email address is required");

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/auth?mode=recovery`,
    });
    if (error) throw error;

    setEmail(normalizedEmail);
    setRecoveryOtp("");
    setRecoverySessionReady(false);
    setRecoveryStep("reset");
    toast.success("OTP sent to your email.");
  }

  async function requestPasswordReset(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await sendRecoveryOtp();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function resendPasswordResetOtp() {
    setLoading(true);
    try {
      await sendRecoveryOtp();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not resend OTP");
    } finally {
      setLoading(false);
    }
  }

  async function resetPasswordWithOtp(e: FormEvent) {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const token = recoveryOtp.trim().replace(/\s/g, "");

      if (!recoverySessionReady) {
        if (!token) throw new Error("OTP code is required");

        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token,
          type: "recovery",
        });
        if (verifyError) throw verifyError;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      await supabase.auth.signOut();

      toast.success("Password changed. Sign in with your new password.");
      setTab("signin");
      setPassword("");
      cancelRecovery();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setLoading(false);
    }
  }

  const isRecovering = recoveryStep !== "idle";

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link to="/" className="flex items-center gap-2">
          <Newspaper className="h-6 w-6" />
          <span className="font-serif text-xl font-bold">AI News Studio</span>
        </Link>
        <div>
          <blockquote className="font-serif text-2xl leading-snug">
            "Create your account first. Organization workspaces, invitations, and editorial roles
            are handled securely after sign in."
          </blockquote>
          <div className="mt-4 text-sm text-sidebar-foreground/70">AI News Studio onboarding</div>
        </div>
        <div className="rounded-lg border border-sidebar-border/50 bg-sidebar-accent/40 p-4 text-xs">
          <div className="font-semibold uppercase text-sidebar-foreground/70">Secure access</div>
          <div className="mt-2">
            Registration only needs your name, email address, and password. Organization ownership
            or invitations are handled inside the application.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <Newspaper className="h-6 w-6 text-primary" />
            <span className="font-serif text-xl font-bold">AI News Studio</span>
          </div>
          {!isRecovering && (
            <div className="flex rounded-md border p-1 text-sm">
              <button
                type="button"
                onClick={() => setTab("signin")}
                className={`flex-1 rounded px-3 py-1.5 font-medium ${
                  tab === "signin" ? "bg-primary text-primary-foreground" : ""
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setTab("signup")}
                className={`flex-1 rounded px-3 py-1.5 font-medium ${
                  tab === "signup" ? "bg-primary text-primary-foreground" : ""
                }`}
              >
                Sign up
              </button>
            </div>
          )}

          {recoveryStep === "request" && (
            <form onSubmit={requestPasswordReset} className="mt-6 space-y-4">
              <div>
                <h1 className="text-lg font-semibold">Forgot password</h1>
                <p className="mt-1 text-sm text-muted-foreground">Receive an OTP by email.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Email address</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "..." : "Send OTP"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={cancelRecovery}
                className="w-full"
              >
                Back to sign in
              </Button>
            </form>
          )}

          {recoveryStep === "reset" && (
            <form onSubmit={resetPasswordWithOtp} className="mt-6 space-y-4">
              <div>
                <h1 className="text-lg font-semibold">Change password</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {recoverySessionReady
                    ? "Choose a new password for your account."
                    : "Use the OTP sent to your email."}
                </p>
              </div>
              {!recoverySessionReady && (
                <>
                  <div className="space-y-1.5">
                    <Label>Email address</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>OTP code</Label>
                    <Input
                      value={recoveryOtp}
                      onChange={(e) => setRecoveryOtp(e.target.value)}
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </div>
                </>
              )}
              <PasswordField
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                show={showNewPassword}
                onToggle={() => setShowNewPassword((value) => !value)}
                autoComplete="new-password"
              />
              <PasswordField
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((value) => !value)}
                autoComplete="new-password"
              />
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "..." : "Change password"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={resendPasswordResetOtp}
                >
                  Resend OTP
                </Button>
                <Button type="button" variant="ghost" disabled={loading} onClick={cancelRecovery}>
                  Back
                </Button>
              </div>
            </form>
          )}

          {!isRecovering && (
            <form onSubmit={submit} className="mt-6 space-y-4">
              {tab === "signup" && signedInEmail && (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Signed in as {signedInEmail}. Creating a new account will switch to the new
                  account.
                </p>
              )}
              {tab === "signup" && (
                <div className="space-y-1.5">
                  <Label>Full name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Email address</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                autoComplete={tab === "signup" ? "new-password" : "current-password"}
                action={
                  tab === "signin" ? (
                    <button
                      type="button"
                      onClick={startRecovery}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  ) : null
                }
              />
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "..." : tab === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  action,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  action?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        {action}
      </div>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={6}
          autoComplete={autoComplete}
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
