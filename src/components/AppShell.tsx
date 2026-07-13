import { Link, useNavigate, useRouteContext, useRouter, useRouterState } from "@tanstack/react-router";
import {
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Share2,
  Users,
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

  const items: Array<{
    to: NavRoute;
    label: string;
    icon: typeof LayoutDashboard;
    show: boolean;
  }> = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/editions", label: role === "editor" ? "My Editions" : "Editions", icon: Newspaper, show: true },
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

  function renderSidebar(collapsed = false) {
    return (
      <div
        className={cn(
          "flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground",
          collapsed ? "w-20" : "w-64",
        )}
      >
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border py-3",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <Link
          to="/dashboard"
          className={cn(
            "flex min-w-0 items-center gap-2",
            collapsed && "h-10 w-10 justify-center rounded-md hover:bg-sidebar-accent/50",
          )}
          title={collapsed ? "AI News Studio" : undefined}
        >
          <Newspaper className={cn("h-5 w-5 shrink-0 text-primary", collapsed && "h-6 w-6")} />
          {!collapsed && (
            <>
              <span className="truncate font-serif text-lg font-bold">AI News</span>
              <span className="shrink-0 text-xs text-sidebar-foreground/60">Studio</span>
            </>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="rounded-md p-1.5 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <nav className={cn("flex-1 py-4", collapsed ? "px-3" : "px-2")}>
        {items.map((it) => {
          const active =
            pathname === it.to || (it.to !== "/dashboard" && pathname.startsWith(it.to));
          return (
            <Link
              key={it.to}
              to={it.to}
              title={collapsed ? it.label : undefined}
              className={cn(
                "mb-1 flex items-center rounded-md text-sm font-medium transition-colors",
                collapsed ? "h-11 justify-center px-0" : "gap-3 px-3 py-2",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
            >
              <it.icon className={cn("h-4 w-4 shrink-0", collapsed && "h-5 w-5")} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
              {it.to === "/dashboard" && ctx.pendingInvitationCount > 0 && (
                <span
                  className={cn(
                    "rounded-full bg-primary text-[10px] font-semibold text-primary-foreground",
                    collapsed ? "absolute ml-7 mt-[-1.75rem] h-4 min-w-4 px-1" : "px-1.5 py-0.5",
                  )}
                >
                  {ctx.pendingInvitationCount}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setSidebarOpen((open) => !open)}
          className={cn(
            "mt-3 hidden w-full items-center rounded-md text-sm font-medium text-sidebar-foreground/70 transition hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground md:flex",
            collapsed ? "h-11 justify-center px-0" : "gap-2 px-3 py-2",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : undefined}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && "Collapse sidebar"}
        </button>
      </nav>
      <div className={cn("border-t border-sidebar-border p-3 text-xs", collapsed && "px-3")}>
        {!collapsed && (
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
        )}
        <button
          type="button"
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex w-full items-center rounded-md text-sidebar-foreground/70 transition hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            collapsed ? "h-11 justify-center px-0" : "gap-2 px-2 py-1.5",
          )}
        >
          <LogOut className={cn("h-4 w-4", collapsed && "h-5 w-5")} />
          {!collapsed && "Sign out"}
        </button>
      </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-r border-sidebar-border transition-[width] duration-300 ease-out md:block",
          sidebarOpen ? "w-64" : "w-20",
        )}
      >
        {renderSidebar(!sidebarOpen)}
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
        {renderSidebar(false)}
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <header className="sticky top-0 z-30 bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-foreground shadow-sm transition hover:bg-muted md:hidden"
              aria-label={sidebarOpen || mobileSidebarOpen ? "Close sidebar" : "Open sidebar"}
              aria-expanded={sidebarOpen || mobileSidebarOpen}
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div
          className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
