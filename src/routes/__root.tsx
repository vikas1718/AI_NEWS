import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useNavigate,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyThemePreference, getStoredThemePreference } from "@/lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page has gone to press without a byline.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try again or head home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AI News Studio - AI-Powered Newsroom Platform" },
      {
        name: "description",
        content:
          "AI-powered newsroom platform for article generation, OCR, editing, layouts, translation, social publishing, and secure editorial collaboration.",
      },
      { property: "og:title", content: "AI News Studio" },
      {
        property: "og:description",
        content:
          "AI-powered newsroom platform for newspapers, publishers, and media organizations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700;900&family=Noto+Sans+Kannada:wght@400;500;600;700&family=Tiro+Kannada&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const [isRecoveryRedirecting, setIsRecoveryRedirecting] = useState(() =>
    shouldRedirectPasswordRecoveryToAuth(),
  );

  useEffect(() => {
    const syncTheme = () => applyThemePreference(getStoredThemePreference());
    syncTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);

  useEffect(() => {
    if (isPasswordRecoveryUrl()) {
      sessionStorage.setItem("ai-news-password-recovery", "1");

      if (window.location.pathname !== "/auth") {
        window.location.replace(passwordRecoveryAuthUrl());
        return;
      }

      setIsRecoveryRedirecting(false);
    }
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem("ai-news-password-recovery", "1");
        navigate({ to: "/auth", search: { mode: "recovery" }, replace: true });
      }

      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, router, queryClient]);

  if (isRecoveryRedirecting) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Opening password reset...
        </div>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

function shouldRedirectPasswordRecoveryToAuth() {
  if (typeof window === "undefined") return false;
  return window.location.pathname !== "/auth" && isPasswordRecoveryUrl();
}

function isPasswordRecoveryUrl() {
  if (typeof window === "undefined") return false;

  const urlText = `${window.location.search}&${window.location.hash}`;
  return (
    urlText.includes("mode=recovery") ||
    urlText.includes("type=recovery") ||
    urlText.includes("access_token=") ||
    urlText.includes("code=") ||
    urlText.includes("token_hash=")
  );
}

function passwordRecoveryAuthUrl() {
  if (typeof window === "undefined") return "/auth?mode=recovery";

  const params = new URLSearchParams(window.location.search);
  params.set("mode", "recovery");
  const query = params.toString();

  return `/auth${query ? `?${query}` : "?mode=recovery"}${window.location.hash}`;
}
