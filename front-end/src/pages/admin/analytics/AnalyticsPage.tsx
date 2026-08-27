"use client"

import { useCallback, useState } from "react"
import { useAuth } from "@clerk/clerk-react"
import { toast } from "sonner"
import { BarChart3, Download, Loader2 } from "lucide-react"

import AdminEmptyState from "@/components/admin/AdminEmptyState"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAdminAnalyticsPage } from "@/hooks/useAdminAnalyticsPage"
import { fetchWithClerkAuth } from "@/lib/api"
import FieldsTab from "@/components/admin/analytics/FieldsTab"
import GlobalAISummary from "@/components/admin/analytics/GlobalAISummary"
import SnapshotTab from "@/components/admin/analytics/SnapshotTab"
import TrendsTab from "@/components/admin/analytics/TrendsTab"
import AlignmentTab from "@/components/admin/analytics/AlignmentTab"

export default function AnalyticsPage() {
  const {
    schoolYearOptions,
    selectedSyId,
    setSelectedSyId,
    departmentOptions,
    selectedDeptId,
    setSelectedDeptId,
    requestWithAdminAuth,
    snapshot,
    isLoadingSnapshot,
    canonicalKeys,
    isLoadingCanonical,
    tab,
    setTab,
    trendFromYear,
    setTrendFromYear,
    trendToYear,
    setTrendToYear,
    selectedTrendKeys,
    setSelectedTrendKeys,
    trendKeyOptions,
    enrolment,
    isLoadingEnrolment,
    trends,
    isLoadingTrends,
    alignment,
    isLoadingAlignment,
  } = useAdminAnalyticsPage()

  const { getToken, isLoaded } = useAuth()
  const [exportingAnalytics, setExportingAnalytics] = useState(false)

  const selectedSyName = schoolYearOptions.find((o) => o.value === selectedSyId)?.label ?? ""
  const selectedDeptName = departmentOptions.find((o) => o.value === selectedDeptId)?.label ?? "All Departments"

  const handleDownloadAnalytics = useCallback(async () => {
    if (!isLoaded || !selectedSyId) return
    const token = await getToken()
    if (!token) {
      toast.error("Authentication required. Please sign in again.")
      return
    }
    setExportingAnalytics(true)
    try {
      const params = new URLSearchParams({ school_year_ids: selectedSyId })
      if (selectedDeptId) params.set("department_id", selectedDeptId)
      const response = await fetchWithClerkAuth(
        `/api/admin/reports/analytics.xlsx?${params.toString()}`,
        token,
      )
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        toast.error(err?.detail ?? "Failed to export analytics report.")
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${selectedSyName.replace(/\s+/g, "-").toLowerCase()}-analytics-report.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      toast.success("Analytics report downloaded.")
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setExportingAnalytics(false)
    }
  }, [isLoaded, selectedSyId, selectedDeptId, selectedSyName, getToken])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Analytics"
        description="Schema-driven analytics across school years"
      />

      <GlobalAISummary
        selectedSyId={selectedSyId}
        selectedDeptId={selectedDeptId}
        schoolYearName={selectedSyName}
        departmentName={selectedDeptName}
        requestWithAdminAuth={requestWithAdminAuth}
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "snapshot" | "trends" | "fields" | "alignment")}
        className="space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="alignment">Alignment</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All Departments</option>
              {departmentOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {tab === "snapshot" && schoolYearOptions.length > 0 && (
              <select
                value={selectedSyId}
                onChange={(e) => setSelectedSyId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {schoolYearOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handleDownloadAnalytics}
              disabled={exportingAnalytics || !isLoaded || !selectedSyId || tab !== "snapshot"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingAnalytics ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export XLSX
            </button>
          </div>
        </div>

        <TabsContent value="snapshot">
          <SnapshotTab snapshot={snapshot} isLoading={isLoadingSnapshot} />
        </TabsContent>

        <TabsContent value="trends">
          {trendKeyOptions.length === 0 ? (
            <AdminEmptyState
              icon={<BarChart3 className="h-10 w-10 text-slate-400" />}
              title="No analytics fields"
              description="Tag fields with analytics in the Schema Builder to see trends."
            />
          ) : (
            <TrendsTab
              trendFromYear={trendFromYear}
              setTrendFromYear={setTrendFromYear}
              trendToYear={trendToYear}
              setTrendToYear={setTrendToYear}
              selectedTrendKeys={selectedTrendKeys}
              setSelectedTrendKeys={setSelectedTrendKeys}
              trendKeyOptions={trendKeyOptions}
              enrolment={enrolment}
              isLoadingEnrolment={isLoadingEnrolment}
              trends={trends}
              isLoadingTrends={isLoadingTrends}
            />
          )}
        </TabsContent>

        <TabsContent value="fields">
          <FieldsTab keys={canonicalKeys} isLoading={isLoadingCanonical} />
        </TabsContent>

        <TabsContent value="alignment">
          <AlignmentTab report={alignment} isLoading={isLoadingAlignment} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
