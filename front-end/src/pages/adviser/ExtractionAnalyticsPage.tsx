import { BarChart3 } from "lucide-react"
import { useUser } from "@clerk/clerk-react"

import AdminEmptyState from "@/components/admin/AdminEmptyState"
import PageHeader from "@/components/adviser/ui/PageHeader"
import ProgramSelector from "@/components/adviser/dashboard/ProgramSelector"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import FieldsTab from "@/components/admin/analytics/FieldsTab"
import GlobalAISummary from "@/components/admin/analytics/GlobalAISummary"
import SnapshotTab from "@/components/admin/analytics/SnapshotTab"
import TrendsTab from "@/components/admin/analytics/TrendsTab"
import { useAdviserExtractionAnalyticsPage } from "@/hooks/useAdviserExtractionAnalyticsPage"
import { useAdviserProgramScope } from "@/hooks/useAdviserProgramScope"

export default function ExtractionAnalyticsPage() {
  const { user } = useUser()
  const { selectedDepartmentId, setSelectedDepartmentId, activeDepartment } = useAdviserProgramScope()
  const {
    schoolYearOptions,
    selectedSyId,
    setSelectedSyId,
    requestWithAuth,
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
  } = useAdviserExtractionAnalyticsPage(selectedDepartmentId)

  const selectedSyName = schoolYearOptions.find((o) => o.value === selectedSyId)?.label ?? ""
  const selectedDeptName = activeDepartment?.name ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Extraction Analytics"
          subtitle={selectedDeptName ? `Department: ${selectedDeptName}` : "Schema-driven analytics filtered to your advisees"}
        />
        <ProgramSelector schoolYearId={selectedSyId} />
      </div>

      <GlobalAISummary
        selectedSyId={selectedSyId}
        selectedDeptId={selectedDepartmentId ?? undefined}
        schoolYearName={selectedSyName}
        departmentName={selectedDeptName ?? "All Departments"}
        requestWithAdminAuth={requestWithAuth}
        insightsEndpoint="/api/adviser/extraction-analytics/insights"
        userId={user?.id}
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "snapshot" | "trends" | "fields")}
        className="space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-3">
            {tab === "snapshot" && schoolYearOptions.length > 0 && (
              <select
                value={selectedSyId}
                onChange={(e) => {
                  const syId = e.target.value
                  setSelectedSyId(syId)
                  setSelectedDepartmentId(null)
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {schoolYearOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
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
      </Tabs>
    </div>
  )
}
