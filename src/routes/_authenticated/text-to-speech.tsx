import { createFileRoute, redirect } from "@tanstack/react-router";

import { KannadaTtsModule } from "@/components/KannadaTtsModule";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/text-to-speech")({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.permissions, "access_assigned_pages")) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: KannadaTtsModule,
});
