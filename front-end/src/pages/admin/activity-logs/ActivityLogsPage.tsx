import { Fragment, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { changedFieldKeys, useActivityAdminOptions, useActivityLogsPage } from "@/hooks/useActivityLogsPage";
import { useActivityLogRetention } from "@/hooks/useActivityLogRetention";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ACTIVITY_ACTION_OPTIONS, ACTIVITY_ENTITY_OPTIONS, type ActivityLogItem } from "@/types/activityLog";

const ENTITY_LABELS = new Map(ACTIVITY_ENTITY_OPTIONS.map((o) => [o.value, o.label]));

const KEEP_FOREVER = "forever";
const PERIOD_OPTIONS = [30, 90, 180, 365] as const;

function periodLabel(days: number): string {
  return days === 365 ? "1 year" : `${days} days`;
}

function formatAction(action: string): string {
  const text = action.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ChangeDetails({ item }: { item: ActivityLogItem }) {
  const keys = changedFieldKeys(item);

  if (keys.length === 0) {
    return <p className="text-sm text-muted-foreground">No field-level changes were recorded.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-4 font-medium">Field</th>
            <th className="py-1 pr-4 font-medium">Before</th>
            <th className="py-1 font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key} className="border-t">
              <td className="py-1.5 pr-4 font-mono text-xs">{key}</td>
              <td className="py-1.5 pr-4 break-all">{formatValue(item.previous_values?.[key])}</td>
              <td className="py-1.5 break-all">{formatValue(item.new_values?.[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ActivityLogsPage() {
  const {
    items,
    total,
    page,
    pageCount,
    pageSize,
    setPage,
    filters,
    setFilters,
    resetFilters,
    isLoading,
    reload,
  } = useActivityLogsPage();

  const retention = useActivityLogRetention(reload);
  const [retentionDraft, setRetentionDraft] = useState<string | null>(null);
  const [purgeDays, setPurgeDays] = useState<string>("365");
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [purgeCount, setPurgeCount] = useState<number | null>(null);
  // Retention change waiting for approval: the period and how many existing entries it would delete.
  const [retentionConfirm, setRetentionConfirm] = useState<{ days: number; count: number } | null>(null);

  const currentRetention = retention.settings
    ? String(retention.settings.retention_days ?? KEEP_FOREVER)
    : "";
  const selectedRetention = retentionDraft ?? currentRetention;
  const retentionChanged = retentionDraft !== null && retentionDraft !== currentRetention;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const adminOptions = useActivityAdminOptions();

  const hasFilters =
    filters.search.trim() !== "" ||
    filters.entityType !== "all" ||
    filters.action !== "all" ||
    filters.actorUserId !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Activity Logs"
        description="A record of changes made by administrators, newest first."
      />

      {retention.settings && retention.settings.retention_days === null ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            Logs are kept forever, including the names and emails of administrators. We recommend
            keeping them for one year. Choose a period below, or use the recommended setting now.
          </p>
          <Button
            size="sm"
            disabled={retention.isSaving}
            onClick={() => retention.saveRetention(365)}
          >
            Set to 1 year
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Keep logs for</h3>
          <p className="text-xs text-muted-foreground">
            Entries older than this are removed automatically when the server starts.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedRetention}
              onValueChange={(value) => setRetentionDraft(value)}
              disabled={retention.isLoading || retention.isSaving}
            >
              <SelectTrigger className="h-9 w-44 text-sm" aria-label="Retention period" data-tour="activity-retention">
                <SelectValue placeholder={retention.isLoading ? "Loading…" : "Select period"} />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {periodLabel(days)}
                  </SelectItem>
                ))}
                <SelectItem value={KEEP_FOREVER}>Keep forever</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!retentionChanged || retention.isSaving}
              onClick={async () => {
                const value = selectedRetention === KEEP_FOREVER ? null : Number(selectedRetention);
                if (value === null) {
                  // Keeping logs forever deletes nothing, so no confirmation is needed.
                  await retention.saveRetention(null);
                  setRetentionDraft(null);
                  return;
                }
                try {
                  const count = await retention.countOlderThan(value);
                  setRetentionConfirm({ days: value, count });
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Could not check how many logs would be deleted.",
                  );
                }
              }}
            >
              {retention.isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Delete older logs</h3>
          <p className="text-xs text-muted-foreground">
            Permanently removes entries older than the chosen period. This cannot be undone.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={purgeDays} onValueChange={setPurgeDays} disabled={retention.isPurging}>
              <SelectTrigger className="h-9 w-44 text-sm" aria-label="Delete logs older than" data-tour="activity-purge">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    Older than {periodLabel(days)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="destructive"
              size="sm"
              data-tour="activity-purge-button"
              disabled={retention.isPurging}
              onClick={async () => {
                try {
                  setPurgeCount(await retention.countOlderThan(Number(purgeDays)));
                  setConfirmPurgeOpen(true);
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Could not check how many logs would be deleted.",
                  );
                }
              }}
            >
              {retention.isPurging ? "Deleting…" : "Delete logs"}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmPurgeOpen} onOpenChange={setConfirmPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete activity logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every activity log entry older than {periodLabel(Number(purgeDays))}.
              {purgeCount !== null ? ` ${purgeCount} ${purgeCount === 1 ? "entry" : "entries"} will be deleted.` : null}
              The deletion itself will be recorded in the log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => retention.purgeOlderThan(Number(purgeDays))}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={retentionConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setRetentionConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keep logs for {retentionConfirm ? periodLabel(retentionConfirm.days) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {retentionConfirm && retentionConfirm.count > 0
                ? `${retentionConfirm.count} existing ${retentionConfirm.count === 1 ? "entry is" : "entries are"} older than this and will be permanently deleted the next time the server starts.`
                : "No existing entries are older than this period. Older entries will be removed automatically when the server starts."}
              {" "}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!retentionConfirm) return;
                retention.saveRetention(retentionConfirm.days).then(() => {
                  setRetentionDraft(null);
                  setRetentionConfirm(null);
                });
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <Input
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          placeholder="Search by admin or item name"
          maxLength={200}
          className="md:w-72"
          aria-label="Search activity logs" data-tour="activity-search"
        />
        <Select value={filters.actorUserId} onValueChange={(value) => setFilters({ actorUserId: value })}>
          <SelectTrigger className="h-9 md:w-48 text-sm" aria-label="Filter by admin" data-tour="activity-filter-admin">
            <SelectValue placeholder="All admins" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All admins</SelectItem>
            {adminOptions.map((admin) => (
              <SelectItem key={admin.id} value={admin.id}>
                {admin.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.entityType} onValueChange={(value) => setFilters({ entityType: value })}>
          <SelectTrigger className="h-9 md:w-56 text-sm" aria-label="Filter by module" data-tour="activity-filter-module">
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {ACTIVITY_ENTITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.action} onValueChange={(value) => setFilters({ action: value })}>
          <SelectTrigger className="h-9 md:w-44 text-sm" aria-label="Filter by action" data-tour="activity-filter-action">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTIVITY_ACTION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ dateFrom: e.target.value })}
            aria-label="From date"
            className="md:w-40"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ dateTo: e.target.value })}
            aria-label="To date"
            className="md:w-40"
          />
        </div>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {isLoading && items.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <AdminEmptyState
          icon={<ScrollText className="h-10 w-10 text-muted-foreground" />}
          title={hasFilters ? "No matching activity" : "No activity yet"}
          description={
            hasFilters
              ? "Try a different search or clear the filters."
              : "Changes made by administrators will appear here."
          }
        />
      ) : (
        <div className="rounded-lg border bg-white">
          <Table data-tour="activity-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>When</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Item</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isOpen = expandedId === item.id;
                return (
                  <Fragment key={item.id}>
                    <TableRow
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => setExpandedId(isOpen ? null : item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setExpandedId(isOpen ? null : item.id);
                        }
                      }}
                    >
                      <TableCell>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(item.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{item.actor_name ?? "Unknown admin"}</div>
                        {item.actor_email ? (
                          <div className="text-xs text-muted-foreground">{item.actor_email}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {formatAction(item.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {ENTITY_LABELS.get(item.entity_type) ?? item.entity_type}
                      </TableCell>
                      <TableCell className="text-sm">{item.entity_label ?? "—"}</TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableCell colSpan={6} className="whitespace-normal">
                          <ChangeDetails item={item} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm tabular-nums">
              {page} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || isLoading}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
