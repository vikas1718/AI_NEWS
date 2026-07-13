const map: Record<string, { label: string; className: string }> = {
  draft:             { label: "Draft",             className: "bg-muted text-muted-foreground border-border" },
  pending_layout:    { label: "Pending Layout",    className: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900" },
  pending_approval:  { label: "Approval Pending",  className: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900" },
  approved:          { label: "Approved",          className: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900" },
  rejected:          { label: "Rejected",          className: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900" },
  published:         { label: "Published",         className: "bg-emerald-900 text-emerald-50 border-emerald-950" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = map[status] ?? { label: status, className: "bg-muted text-muted-foreground border-border" };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.className}`}>{m.label}</span>;
}
