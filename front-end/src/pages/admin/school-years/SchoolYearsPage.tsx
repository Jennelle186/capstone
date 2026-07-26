import { FileDown, Loader2, Plus, RefreshCw } from "lucide-react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SchoolYearFormDialog from "@/components/admin/school-years/SchoolYearFormDialog";
import { Button } from "@/components/ui/button";
import { useSchoolYearsPage } from "@/hooks/useSchoolYearsPage";

import ActiveSchoolYearCard from "./ActiveSchoolYearCard";
import SchoolYearConfirmationDialogs from "./SchoolYearConfirmationDialogs";
import SchoolYearDetailsDialog from "./SchoolYearDetailsDialog";
import SchoolYearRolloverDialog from "./SchoolYearRolloverDialog";
import SchoolYearsTable from "./SchoolYearsTable";

export default function SchoolYearsPage() {
    const {
        activationIntent,
        activationPreview,
        activeSchoolYear,
        closeSchoolYear,
        editingSchoolYear,
        exportSchoolYearsCsv,
        filteredSchoolYears,
        formData,
        handleConfirmActivation,
        handleFormOpenChange,
        handleQuickActivate,
        handleRolloverOpenChange,
        handleViewOpenChange,
        isAssignmentsLoading,
        isAuditLogsLoading,
        isActivationPreviewLoading,
        isFormOpen,
        isLoading,
        isRolloverOpen,
        isSaving,
        isViewOpen,
        openCreateDialog,
        openEditDialog,
        openRolloverDialog,
        openViewDialog,
        reopenSchoolYear,
        rolloverFormData,
        rolloverSourceSchoolYear,
        runAutoClosure,
        schoolYearAssignments,
        schoolYearAuditLogs,
        schoolYearRequirements,
        documentTypes,
        extractionSchemas,
        isRequirementsLoading,
        schoolYears,
        schoolYearToClose,
        schoolYearToDeactivate,
        schoolYearToReopen,
        searchQuery,
        setActivationIntent,
        setFormData,
        setRolloverFormData,
        setSchoolYearInactive,
        setSchoolYearToClose,
        setSchoolYearToDeactivate,
        setSchoolYearToReopen,
        setSearchQuery,
        setStatusFilter,
        statusFilter,
        submitRollover,
        submitSchoolYear,
        viewingSchoolYear,
    } = useSchoolYearsPage();

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading school years...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="School Year"
                description="Manage academic years used for submissions, adviser assignments, document templates, and records."
                className="sm:items-start"
                actions={(
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={runAutoClosure}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Run Auto Closure
                        </Button>
                        <Button variant="outline" onClick={exportSchoolYearsCsv}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Export CSV
                        </Button>
                        <Button onClick={openCreateDialog}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add New School Year
                        </Button>
                    </div>
                )}
            />

            <ActiveSchoolYearCard
                activeSchoolYear={activeSchoolYear}
                openCreateDialog={openCreateDialog}
                openEditDialog={openEditDialog}
                openRolloverDialog={openRolloverDialog}
                setSchoolYearToClose={setSchoolYearToClose}
                setSchoolYearToDeactivate={setSchoolYearToDeactivate}
            />

            <SchoolYearsTable
                filteredSchoolYears={filteredSchoolYears}
                handleQuickActivate={handleQuickActivate}
                openCreateDialog={openCreateDialog}
                openEditDialog={openEditDialog}
                openRolloverDialog={openRolloverDialog}
                openViewDialog={openViewDialog}
                schoolYears={schoolYears}
                searchQuery={searchQuery}
                setSchoolYearToClose={setSchoolYearToClose}
                setSchoolYearToDeactivate={setSchoolYearToDeactivate}
                setSchoolYearToReopen={setSchoolYearToReopen}
                setSearchQuery={setSearchQuery}
                setStatusFilter={setStatusFilter}
                statusFilter={statusFilter}
            />

            <SchoolYearFormDialog
                open={isFormOpen}
                onOpenChange={handleFormOpenChange}
                form={formData}
                onChange={setFormData}
                isSubmitting={isSaving}
                onSubmit={() => submitSchoolYear()}
                title={editingSchoolYear ? "Edit School Year" : "Add School Year"}
                submitLabel="Save"
                submittingLabel="Saving..."
            />

            <SchoolYearRolloverDialog
                handleRolloverOpenChange={handleRolloverOpenChange}
                isRolloverOpen={isRolloverOpen}
                isSaving={isSaving}
                rolloverFormData={rolloverFormData}
                rolloverSourceSchoolYear={rolloverSourceSchoolYear}
                setRolloverFormData={setRolloverFormData}
                submitRollover={submitRollover}
            />

            <SchoolYearDetailsDialog
                handleViewOpenChange={handleViewOpenChange}
                isAssignmentsLoading={isAssignmentsLoading}
                isAuditLogsLoading={isAuditLogsLoading}
                isRequirementsLoading={isRequirementsLoading}
                isViewOpen={isViewOpen}
                schoolYearAssignments={schoolYearAssignments}
                schoolYearAuditLogs={schoolYearAuditLogs}
                schoolYearRequirements={schoolYearRequirements}
                documentTypes={documentTypes}
                extractionSchemas={extractionSchemas}
                viewingSchoolYear={viewingSchoolYear}
            />

            <SchoolYearConfirmationDialogs
                activationIntent={activationIntent}
                activationPreview={activationPreview}
                closeSchoolYear={closeSchoolYear}
                handleConfirmActivation={handleConfirmActivation}
                isActivationPreviewLoading={isActivationPreviewLoading}
                reopenSchoolYear={reopenSchoolYear}
                schoolYearToClose={schoolYearToClose}
                schoolYearToDeactivate={schoolYearToDeactivate}
                schoolYearToReopen={schoolYearToReopen}
                setActivationIntent={setActivationIntent}
                setSchoolYearInactive={setSchoolYearInactive}
                setSchoolYearToClose={setSchoolYearToClose}
                setSchoolYearToDeactivate={setSchoolYearToDeactivate}
                setSchoolYearToReopen={setSchoolYearToReopen}
            />
        </div>
    );
}
