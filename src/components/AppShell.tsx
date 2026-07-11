import { Link, useNavigate, useRouteContext, useRouter, useRouterState } from "@tanstack/react-router";
import {
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  Settings,
  Share2,
  Users,
  Wand2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { roleLabels } from "@/lib/rbac";

type NavRoute =
  | "/dashboard"
  | "/editions"
  | "/ai-generate-layout"
  | "/review"
  | "/team"
  | "/settings"
  | "/organization-settings"
  | "/multiplatform/instagram";

export function AppShell({ children }: { children: ReactNode }) {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const role = ctx.role;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isEditionWorkspace = pathname.startsWith("/editions/");

  const items: Array<{
    to: NavRoute;
    label: string;
    icon: typeof LayoutDashboard;
    show: boolean;
  }> = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/editions", label: role === "editor" ? "My Editions" : "Editions", icon: Newspaper, show: true },
    { to: "/ai-generate-layout", label: "AI Generate Layout", icon: Wand2, show: true },
    { to: "/multiplatform/instagram", label: "Multiplatform", icon: Share2, show: true },
    { to: "/review", label: "Review Queue", icon: FileCheck2, show: role === "chief_editor" },
    { to: "/team", label: "Organization", icon: Users, show: true },
    { to: "/settings", label: "Profile", icon: Settings, show: true },
  ].filter((x) => x.show);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setMobileSidebarOpen((open) => !open);
      return;
    }
    setSidebarOpen((open) => !open);
  }

  async function switchOrganization(organizationId: string) {
    window.localStorage.setItem("ai-news-active-organization-id", organizationId);
    await router.invalidate();
    navigate({ to: "/dashboard" });
  }

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  const roleLabel = ctx.role ? roleLabels[ctx.role] : "Create workspace";
  const organizationName = ctx.organization?.name ?? "Set up team";
  const activeOrganizationId = ctx.organization?.id;

  const sidebar = (
    <div className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
          <Newspaper className="h-5 w-5 shrink-0 text-primary" />
          <span className="truncate font-serif text-lg font-bold">AI News</span>
          <span className="shrink-0 text-xs text-sidebar-foreground/60">Studio</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(false)}
          className="rounded-md p-1.5 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex-1 px-2 py-4">
        {items.map((it) => {
          const active =
            pathname === it.to || (it.to !== "/dashboard" && pathname.startsWith(it.to));
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
            >
              <it.icon className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.to === "/dashboard" && ctx.pendingInvitationCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {ctx.pendingInvitationCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3 text-xs">
        <div className="mb-2 px-2">
          <div className="truncate font-medium">{ctx.user.email}</div>
          {ctx.organizations.length > 1 && activeOrganizationId ? (
            <div className="mt-2">
              <Select value={activeOrganizationId} onValueChange={(value) => void switchOrganization(value)}>
                <SelectTrigger className="h-8 border-sidebar-border/70 bg-sidebar-accent/30 text-xs text-sidebar-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ctx.organizations.map((item) => (
                    <SelectItem key={item.organization.id} value={item.organization.id}>
                      {item.organization.name} - {roleLabels[item.membership.role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="truncate text-sidebar-foreground/60">{organizationName}</div>
          )}
          <div className="mt-1 text-sidebar-foreground/60">{roleLabel}</div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground/70 transition hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-r border-sidebar-border transition-[width] duration-300 ease-out md:block",
          sidebarOpen ? "w-64" : "w-0",
        )}
        aria-hidden={!sidebarOpen}
      >
        {sidebar}
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] transition-opacity duration-300 md:hidden",
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform shadow-2xl transition-transform duration-300 ease-out md:hidden",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!mobileSidebarOpen}
      >
        {sidebar}
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden transition-[margin,width] duration-300 ease-out">
        <header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-foreground shadow-sm transition hover:bg-muted"
              aria-label={sidebarOpen || mobileSidebarOpen ? "Close sidebar" : "Open sidebar"}
              aria-expanded={sidebarOpen || mobileSidebarOpen}
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{organizationName}</div>
              <div className="truncate text-xs text-muted-foreground">{roleLabel} workspace</div>
            </div>
            {ctx.organizations.length > 1 && activeOrganizationId && (
              <div className="ml-auto hidden w-72 sm:block">
                <Select value={activeOrganizationId} onValueChange={(value) => void switchOrganization(value)}>
                  <SelectTrigger className="h-9 bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ctx.organizations.map((item) => (
                      <SelectItem key={item.organization.id} value={item.organization.id}>
                        {item.organization.name} - {roleLabels[item.membership.role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </header>
        <div
          className={cn(
            "mx-auto px-4 py-6 sm:px-6 sm:py-8",
            isEditionWorkspace ? "w-full max-w-[1920px] 2xl:px-8" : "max-w-7xl",
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
