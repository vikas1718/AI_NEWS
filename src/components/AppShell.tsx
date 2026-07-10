import { Link, useNavigate, useRouteContext, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { hasPermission, roleLabels, type PermissionKey } from "@/lib/rbac";

type NavRoute =
  "/dashboard" | "/editions" | "/review" | "/team" | "/settings" | "/organization-settings";

export function AppShell({ children }: { children: ReactNode }) {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const can = (permission: PermissionKey) => hasPermission(ctx.permissions, permission);

  const items: Array<{
    to: NavRoute;
    label: string;
    icon: typeof LayoutDashboard;
    show: boolean;
  }> = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/editions", label: "Editions", icon: Newspaper, show: can("access_assigned_pages") },
    { to: "/review", label: "Review Queue", icon: FileCheck2, show: can("review_articles") },
    {
      to: "/team",
      label: ctx.organization ? "Team" : "Create Team",
      icon: Users,
      show: !ctx.organization || can("manage_team"),
    },
    { to: "/settings", label: "Settings", icon: UserRound, show: true },
    {
      to: "/organization-settings",
      label: "Organization Settings",
      icon: Building2,
      show: can("organization_settings"),
    },
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

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  const roleLabel = ctx.role ? roleLabels[ctx.role] : "Create workspace";
  const organizationName = ctx.organization?.name ?? "Set up team";

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
          <div className="truncate text-sidebar-foreground/60">{organizationName}</div>
          <div className="text-sidebar-foreground/60">{roleLabel}</div>
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
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
