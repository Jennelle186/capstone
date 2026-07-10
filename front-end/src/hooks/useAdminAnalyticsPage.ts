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
import type { DepartmentCreateResponse } from "@/types/department"
import type { SchoolYearRecord } from "@/types/schoolYear"

export function useAdminAnalyticsPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const getTokenRef = useStableToken()

  const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([])
  const [selectedSyId, setSelectedSyId] = useState<string>("")
  const [departments, setDepartments] = useState<DepartmentCreateResponse[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState<string>("")
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

  const deptQuery = selectedDeptId ? `&department_id=${selectedDeptId}` : ""

  const requestWithAdminAuth = useCallback(
    async (path: string, init?: RequestInit): Promise<unknown> => {
      const token = await getTokenRef.current()
      if (!token) throw new Error("Missing admin authentication token.")
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
      const payload = (await requestWithAdminAuth("/api/admin/school-years")) as SchoolYearRecord[]
      setSchoolYears(payload)
      const active = payload.find((sy) => sy.status === "active" || sy.is_active)
      if (active) setSelectedSyId(active.id)
      else if (payload.length > 0) setSelectedSyId(payload[0].id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load school years.")
    }
  }, [requestWithAdminAuth])

  const loadDepartments = useCallback(async () => {
    try {
      const payload = (await requestWithAdminAuth("/api/admin/departments")) as DepartmentCreateResponse[]
      setDepartments(payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load departments.")
    }
  }, [requestWithAdminAuth])

  const loadSnapshot = useCallback(
    async (syId: string) => {
      if (!syId) return
      setIsLoadingSnapshot(true)
      try {
        const payload = (await requestWithAdminAuth(
          `/api/admin/analytics/extractions?school_year_id=${syId}${deptQuery}`,
        )) as SnapshotResponse
        setSnapshot(payload)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load analytics.")
      } finally {
        setIsLoadingSnapshot(false)
      }
    },
    [requestWithAdminAuth, deptQuery],
  )

  const loadCanonicalKeys = useCallback(async () => {
    setIsLoadingCanonical(true)
    try {
      const payload = (await requestWithAdminAuth(
        "/api/admin/analytics/canonical-keys",
      )) as CanonicalKeysResponse
      setCanonicalKeys(payload.keys)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load canonical keys.")
    } finally {
      setIsLoadingCanonical(false)
    }
  }, [requestWithAdminAuth])

  const loadEnrolment = useCallback(
    async (from: string, to: string) => {
      setIsLoadingEnrolment(true)
      try {
        const payload = (await requestWithAdminAuth(
          `/api/admin/analytics/enrolment?from_year=${from}&to_year=${to}${deptQuery}`,
        )) as EnrolmentResponse
        setEnrolment(payload.series)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load enrolment data.")
      } finally {
        setIsLoadingEnrolment(false)
      }
    },
    [requestWithAdminAuth, deptQuery],
  )

  const loadTrends = useCallback(
    async (keys: string[], from: string, to: string) => {
      if (keys.length === 0) return
      setIsLoadingTrends(true)
      try {
        const payload = (await requestWithAdminAuth(
          `/api/admin/analytics/trends?keys=${keys.join(",")}&from_year=${from}&to_year=${to}${deptQuery}`,
        )) as TrendResponse
        setTrends(payload)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load trends.")
      } finally {
        setIsLoadingTrends(false)
      }
    },
    [requestWithAdminAuth, deptQuery],
  )

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setSchoolYears([])
      setDepartments([])
      setIsLoadingSnapshot(false)
      setIsLoadingCanonical(false)
      setIsLoadingEnrolment(false)
      return
    }
    void loadSchoolYears()
    void loadDepartments()
    void loadCanonicalKeys()
    void loadEnrolment("2023", "2026")
  }, [isLoaded, isSignedIn, loadSchoolYears, loadDepartments, loadCanonicalKeys, loadEnrolment])

  useEffect(() => {
    if (!selectedSyId) return
    void loadSnapshot(selectedSyId)
  }, [selectedSyId, loadSnapshot, deptQuery])

  useEffect(() => {
    if (tab !== "trends") return
    void loadTrends(selectedTrendKeys, trendFromYear, trendToYear)
  }, [tab, selectedTrendKeys, trendFromYear, trendToYear, loadTrends, deptQuery])

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

  const departmentOptions = useMemo(
    () =>
      departments
        .filter((d) => d.is_active)
        .map((d) => ({
          value: d.id,
          label: d.name,
        })),
    [departments],
  )

  return {
    schoolYears,
    schoolYearOptions,
    selectedSyId,
    setSelectedSyId,
    departmentOptions,
    selectedDeptId,
    setSelectedDeptId,
    requestWithAdminAuth,
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
