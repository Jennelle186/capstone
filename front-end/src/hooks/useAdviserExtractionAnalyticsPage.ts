import { useAuth } from "@clerk/clerk-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useStableToken } from "@/hooks/useStableToken"
import { fetchWithClerkAuth } from "@/lib/api"
import type {
  CanonicalKeyItem,
  CanonicalKeysResponse,
  EnrolmentResponse,
  EnrolmentSeriesItem,
  FieldAnalytics,
  SnapshotResponse,
  TrendResponse,
} from "@/types/analytics"

interface AdviserSchoolYear {
  id: string
  name: string
  is_current: boolean
}

// Accepts the selected department filter from the program scope context so the
// page can drive department filtering via the shared ProgramSelector component.
export function useAdviserExtractionAnalyticsPage(departmentId?: string | null) {
  const { isLoaded, isSignedIn } = useAuth()
  const getTokenRef = useStableToken()

  const [schoolYears, setSchoolYears] = useState<AdviserSchoolYear[]>([])
  const [selectedSyId, setSelectedSyId] = useState<string>("")
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null)
  const [canonicalKeys, setCanonicalKeys] = useState<CanonicalKeyItem[]>([])
  const [enrolment, setEnrolment] = useState<EnrolmentSeriesItem[]>([])
  const [trends, setTrends] = useState<TrendResponse | null>(null)

  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true)
  const [isLoadingCanonical, setIsLoadingCanonical] = useState(true)
  const [isLoadingEnrolment, setIsLoadingEnrolment] = useState(true)
  const [isLoadingTrends, setIsLoadingTrends] = useState(false)

  const [tab, setTab] = useState<"snapshot" | "trends" | "fields">("snapshot")
  const [trendFromYear, setTrendFromYear] = useState("2023")
  const [trendToYear, setTrendToYear] = useState("2026")
  const [selectedTrendKeys, setSelectedTrendKeys] = useState<string[]>(["gender"])

  const apiBase = "/api/adviser/extraction-analytics"

  const requestWithAuth = useCallback(
    async (path: string, init?: RequestInit): Promise<unknown> => {
      const token = await getTokenRef.current()
      if (!token) throw new Error("Missing authentication token.")
      const response = await fetchWithClerkAuth(path, token, init)
      if (!response.ok) {
        let message = `Request failed with status ${response.status}.`
        try {
          const payload = (await response.json()) as Record<string, unknown>
          message = (payload.detail as string) ?? message
        } catch { /* ignore */ }
        throw new Error(message)
      }
      return response.status === 204 ? null : ((await response.json()) as unknown)
    },
    [getTokenRef],
  )

  const loadSchoolYears = useCallback(async () => {
    try {
      const payload = (await requestWithAuth(`${apiBase}/school-years`)) as AdviserSchoolYear[]
      setSchoolYears(payload)
      const active = payload.find((sy) => sy.is_current)
      if (active) setSelectedSyId(active.id)
      else if (payload.length > 0) setSelectedSyId(payload[0].id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load school years.")
    }
  }, [requestWithAuth, apiBase])

  const loadSnapshot = useCallback(
    async (syId: string, deptId?: string | null) => {
      if (!syId) return
      setIsLoadingSnapshot(true)
      try {
        const deptQuery = deptId ? `&department_id=${deptId}` : ""
        const payload = (await requestWithAuth(
          `${apiBase}/snapshot?school_year_id=${syId}${deptQuery}`,
        )) as SnapshotResponse
        setSnapshot(payload)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load analytics.")
      } finally {
        setIsLoadingSnapshot(false)
      }
    },
    [requestWithAuth, apiBase],
  )

  const loadCanonicalKeys = useCallback(async () => {
    setIsLoadingCanonical(true)
    try {
      const payload = (await requestWithAuth(
        `${apiBase}/canonical-keys`,
      )) as CanonicalKeysResponse
      setCanonicalKeys(payload.keys)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load canonical keys.")
    } finally {
      setIsLoadingCanonical(false)
    }
  }, [requestWithAuth, apiBase])

  const loadEnrolment = useCallback(
    async (from: string, to: string, deptId?: string | null) => {
      setIsLoadingEnrolment(true)
      try {
        const deptQuery = deptId ? `&department_id=${deptId}` : ""
        const payload = (await requestWithAuth(
          `${apiBase}/enrolment?from_year=${from}&to_year=${to}${deptQuery}`,
        )) as EnrolmentResponse
        setEnrolment(payload.series)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load enrolment data.")
      } finally {
        setIsLoadingEnrolment(false)
      }
    },
    [requestWithAuth, apiBase],
  )

  const loadTrends = useCallback(
    async (keys: string[], from: string, to: string, deptId?: string | null) => {
      if (keys.length === 0) return
      setIsLoadingTrends(true)
      try {
        const deptQuery = deptId ? `&department_id=${deptId}` : ""
        const payload = (await requestWithAuth(
          `${apiBase}/trends?keys=${keys.join(",")}&from_year=${from}&to_year=${to}${deptQuery}`,
        )) as TrendResponse
        setTrends(payload)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load trends.")
      } finally {
        setIsLoadingTrends(false)
      }
    },
    [requestWithAuth, apiBase],
  )

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setSchoolYears([])
      setIsLoadingSnapshot(false)
      setIsLoadingCanonical(false)
      setIsLoadingEnrolment(false)
      return
    }
    void loadSchoolYears()
    void loadCanonicalKeys()
  }, [isLoaded, isSignedIn, loadSchoolYears, loadCanonicalKeys])

  useEffect(() => {
    if (!selectedSyId) return
    void loadSnapshot(selectedSyId, departmentId)
  }, [selectedSyId, departmentId, loadSnapshot])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    void loadEnrolment(trendFromYear, trendToYear, departmentId)
  }, [isLoaded, isSignedIn, trendFromYear, trendToYear, departmentId, loadEnrolment])

  useEffect(() => {
    if (tab !== "trends") return
    void loadTrends(selectedTrendKeys, trendFromYear, trendToYear, departmentId)
  }, [tab, selectedTrendKeys, trendFromYear, trendToYear, departmentId, loadTrends])

  const snapshotFieldsByGroup = useMemo(() => {
    if (!snapshot) return []
    const groups: Record<string, FieldAnalytics[]> = {}
    for (const f of snapshot.fields) {
      const g = f.analytics_group ?? "Ungrouped"
      if (!groups[g]) groups[g] = []
      groups[g].push(f)
    }
    return Object.entries(groups).map(([group, fields]) => ({ group, fields }))
  }, [snapshot])

  const trendKeyOptions = useMemo(
    () =>
      canonicalKeys.map((k) => ({
        value: k.canonical_key,
        label: k.label,
      })),
    [canonicalKeys],
  )

  const schoolYearOptions = useMemo(
    () =>
      schoolYears.map((sy) => ({
        value: sy.id,
        label: sy.name,
      })),
    [schoolYears],
  )

  return {
    schoolYears,
    schoolYearOptions,
    selectedSyId,
    setSelectedSyId,
    requestWithAuth,
    snapshot,
    isLoadingSnapshot,
    yearFieldsByGroup: snapshotFieldsByGroup,
    canonicalKeys,
    isLoadingCanonical,
    enrolment,
    isLoadingEnrolment,
    trends,
    isLoadingTrends,
    tab,
    setTab,
    trendFromYear,
    setTrendFromYear,
    trendToYear,
    setTrendToYear,
    selectedTrendKeys,
    setSelectedTrendKeys,
    trendKeyOptions,
  }
}
