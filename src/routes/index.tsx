import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AiNewsStudioLanding } from "@/components/landing/AiNewsStudioLanding";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI News Studio - AI-Powered Newsroom Platform" },
      {
        name: "description",
        content:
          "AI News Studio is an enterprise AI newsroom platform for news generation, OCR, editing, social publishing, translation, and secure editorial collaboration.",
      },
      { property: "og:title", content: "AI News Studio - AI-Powered Newsrooms" },
      {
        property: "og:description",
        content:
          "Create articles, extract scanned content, generate visuals, and manage newsroom workflows with AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [isRecoveryRedirect, setIsRecoveryRedirect] = useState(() => hasRecoveryParams());

  useEffect(() => {
    if (!hasRecoveryParams()) return;

    setIsRecoveryRedirect(true);
    window.location.replace(passwordRecoveryAuthUrl());
  }, []);

  if (isRecoveryRedirect) return null;

  return <AiNewsStudioLanding />;
}

function hasRecoveryParams() {
  if (typeof window === "undefined") return false;

  return (
    window.location.search.includes("mode=recovery") ||
    window.location.hash.includes("type=recovery") ||
    window.location.search.includes("type=recovery") ||
    window.location.hash.includes("access_token=") ||
    window.location.search.includes("code=") ||
    window.location.search.includes("token_hash=")
  );
}

function passwordRecoveryAuthUrl() {
  if (typeof window === "undefined") return "/auth?mode=recovery";

  const params = new URLSearchParams(window.location.search);
  params.set("mode", "recovery");
  const query = params.toString();

  return `/auth${query ? `?${query}` : "?mode=recovery"}${window.location.hash}`;
}
