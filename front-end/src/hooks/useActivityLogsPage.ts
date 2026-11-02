import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import { readApiErrorMessage } from "@/lib/apiError";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityLogListResponse,
  type ActivityLogItem,
} from "@/types/activityLog";

export interface ActivityLogFilters {
  search: string;
  entityType: string; // "all" or an entity_type value
  action: string; // "all" or an action value
  actorUserId: string; // "all" or a user id
  dateFrom: string; // YYYY-MM-DD from <input type="date">, or ""
  dateTo: string;
}

const DEFAULT_FILTERS: ActivityLogFilters = {
  search: "",
  entityType: "all",
  action: "all",
  actorUserId: "all",
  dateFrom: "",
  dateTo: "",
};

/** Start of the given local day, as an ISO string the API accepts. */
function startOfDayIso(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

/** End of the given local day, as an ISO string the API accepts. */
function endOfDayIso(date: string): string {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

export function buildActivityLogQuery(
  filters: ActivityLogFilters,
  page: number,
  pageSize: number = ACTIVITY_PAGE_SIZE,
): string {
  const params = new URLSearchParams();
  params.set("skip", String((page - 1) * pageSize));
  params.set("limit", String(pageSize));

  const search = filters.search.trim();
  if (search) params.set("search", search);
  if (filters.entityType !== "all") params.set("entity_type", filters.entityType);
  if (filters.action !== "all") params.set("action", filters.action);
  if (filters.actorUserId !== "all") params.set("actor_user_id", filters.actorUserId);
  if (filters.dateFrom) params.set("date_from", startOfDayIso(filters.dateFrom));
  if (filters.dateTo) params.set("date_to", endOfDayIso(filters.dateTo));

  return `/api/admin/activity-logs?${params.toString()}`;
}

/**
 * Keys whose before and after values differ. Some entries (for example school-year actions)
 * store the full snapshot on both sides, so unchanged fields must not be listed as changes.
 */
export function changedFieldKeys(item: Pick<ActivityLogItem, "previous_values" | "new_values">): string[] {
  const keys = new Set([
    ...Object.keys(item.previous_values ?? {}),
    ...Object.keys(item.new_values ?? {}),
  ]);
  return Array.from(keys).filter(
    (key) => JSON.stringify(item.previous_values?.[key]) !== JSON.stringify(item.new_values?.[key]),
  );
}

export interface ActivityAdminOption {
  id: string;
  name: string;
}

/** Current administrators, for the "by admin" filter. Past admins appear only by name in their rows. */
export function useActivityAdminOptions(): ActivityAdminOption[] {
  const getTokenRef = useStableToken();
  const [options, setOptions] = useState<ActivityAdminOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;
        const response = await fetchWithClerkAuth("/api/admin/admins", token);
        if (!response.ok) throw new Error(`Failed to load administrators (${response.status}).`);
        const data = (await response.json()) as { id: string; name: string }[];
        if (!cancelled) setOptions(data.map((admin) => ({ id: admin.id, name: admin.name })));
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load administrators.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getTokenRef]);

  return options;
}

export function useActivityLogsPage() {
  const getTokenRef = useStableToken();

  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFiltersState] = useState<ActivityLogFilters>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);

  const setFilters = useCallback((next: Partial<ActivityLogFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
    // Any filter change starts again from the first page.
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const token = await getTokenRef.current();
        if (!token) throw new Error("Missing admin authentication token.");

        const response = await fetchWithClerkAuth(buildActivityLogQuery(filters, page), token);
        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response));
        }

        const data = (await response.json()) as ActivityLogListResponse;
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load activity logs.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // getTokenRef is a stable ref; only the query inputs should retrigger loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));

  return {
    items,
    total,
    page,
    pageCount,
    pageSize: ACTIVITY_PAGE_SIZE,
    setPage,
    filters,
    setFilters,
    resetFilters,
    isLoading,
    reload,
  };
}
