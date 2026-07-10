import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/multiplatform")({
  beforeLoad: () => {
    throw redirect({ to: "/multiplatform/instagram" });
  },
});
