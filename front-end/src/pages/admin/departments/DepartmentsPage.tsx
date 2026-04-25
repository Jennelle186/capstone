import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowRightLeft,
    Building2,
    GraduationCap,
    PencilLine,
    Plus,
    Search,
    UserCheck,
    Users,
    X,
} from "lucide-react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AssignDepartmentDialog from "@/components/admin/departments/AssignDepartmentDialog";
import DepartmentFormDialog from "@/components/admin/departments/DepartmentFormDialog";
import { fadeInUp, staggerContainer } from "@/components/admin/motion-variants";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getInitials } from "@/lib/adviser-utils";
import { useDepartmentsPage } from "@/hooks/useDepartmentsPage";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function DepartmentsPage() {
    const {
        addDepartmentForm,
        advisers,
        assignedAdvisersCount,
        departmentFormError,
        departments,
        editDepartmentForm,
        editDepartmentFormError,
        editDepartmentIsActive,
        getDepartmentAdviserCount,
        getVisibleAdvisersByDepartment,
        handleAddDepartment,
        handleAssignDepartment,
        handleEditDepartment,
        handleUnassign,
        filteredDepartments,
        filteredUnassignedAdvisers,
        isAddDepartmentDialogOpen,
        isAddingDepartment,
        isAssignDialogOpen,
        isEditDepartmentDialogOpen,
        isEditingDepartment,
        isPageLoading,
        isSelectedSchoolYearClosed,
        isUpdatingAssignment,
        onSchoolYearChange,
        openAddDepartmentDialog,
        openAssignDialog,
        openEditDepartmentDialog,
        schoolYears,
        searchQuery,
        selectedAdviser,
        selectedDepartment,
        selectedSchoolYearId,
        selectedSchoolYearName,
        setSearchQuery,
        setAddDepartmentForm,
        setEditDepartmentForm,
        setEditDepartmentIsActive,
        setIsAddDepartmentDialogOpen,
        setIsAssignDialogOpen,
        setIsEditDepartmentDialogOpen,
        setSelectedDepartment,
    } = useDepartmentsPage();
    const visibleAssignedAdvisersCount = filteredDepartments.reduce(
        (count, department) => count + getVisibleAdvisersByDepartment(department).length,
        0,
    );
    const visibleAdvisersTotal = filteredUnassignedAdvisers.length + visibleAssignedAdvisersCount;

    if (isPageLoading) {
        return <p className="text-sm text-muted-foreground">Loading departments...</p>;
    }

    return (
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6">
            <motion.div variants={fadeInUp}>
                <AdminPageHeader
                    title="Departments"
                    description={
                        selectedSchoolYearName
                            ? `Assign advisers per department for school year ${selectedSchoolYearName}.`
                            : "Assign advisers to departments by school year."
                    }
                    actions={(
                        <Button onClick={openAddDepartmentDialog}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Department
                        </Button>
                    )}
                />
            </motion.div>

            <motion.div variants={fadeInUp}>
                <Card>
                    <CardContent className="space-y-3 p-4">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search adviser, email, department code/name, or school year..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-medium text-foreground">School Year Filter</p>
                            <p className="text-xs text-muted-foreground">
                                Department assignments shown below are scoped to the selected school year.
                            </p>
                        </div>
                        <Select
                            value={selectedSchoolYearId ?? undefined}
                            onValueChange={onSchoolYearChange}
                        >
                            <SelectTrigger className="w-full sm:w-52">
                                <SelectValue placeholder="Select school year" />
                            </SelectTrigger>
                            <SelectContent>
                                {schoolYears.map((schoolYear) => (
                                    <SelectItem key={schoolYear.id} value={schoolYear.id}>
                                        {schoolYear.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {isSelectedSchoolYearClosed ? (
                <motion.div variants={fadeInUp}>
                    <Card className="border-amber-300 bg-amber-50">
                        <CardContent className="p-4 text-sm text-amber-800">
                            The selected school year is closed. You can review assignments, but assignment changes are disabled.
                        </CardContent>
                    </Card>
                </motion.div>
            ) : null}

            <motion.div variants={fadeInUp}>
                <Card className="border-0 shadow-md border-l-4 border-l-orange-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <UserCheck className="w-5 h-5 text-orange-500" />
                            Unassigned Advisers
                            <Badge variant="secondary" className="ml-2">
                                {filteredUnassignedAdvisers.length}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {filteredUnassignedAdvisers.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {filteredUnassignedAdvisers.map((adviser) => (
                                    <motion.div
                                        key={adviser.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        whileHover={{ scale: 1.02 }}
                                    >
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openAssignDialog(adviser)}
                                            className="gap-2"
                                            disabled={isSelectedSchoolYearClosed}
                                        >
                                            <Avatar className="w-6 h-6">
                                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                                    {getInitials(adviser.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            {adviser.name}
                                            <ArrowRightLeft className="w-3 h-3 ml-1" />
                                        </Button>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm">All advisers are assigned to departments</p>
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div variants={fadeInUp} className="grid md:grid-cols-2 gap-6">
                {filteredDepartments.map((department, index) => {
                    const departmentAdvisers = getVisibleAdvisersByDepartment(department);

                    return (
                        <motion.div
                            key={department.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <Card className="border-0 shadow-md h-full">
                                <CardHeader className="pb-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                                <Building2 className="w-6 h-6 text-primary" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{department.value}</CardTitle>
                                                <p className="text-sm text-muted-foreground">{department.label}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                <GraduationCap className="w-4 h-4" />
                                                <span>{department.studentCount} students</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                                                <Users className="w-4 h-4" />
                                                <span>{departmentAdvisers.length} advisers</span>
                                            </div>
                                            <div className="mt-2">
                                                <Badge
                                                    className={
                                                        department.isActive
                                                            ? "bg-green-500/10 text-green-600"
                                                            : "bg-red-500/10 text-red-600"
                                                    }
                                                >
                                                    {department.isActive ? "Active" : "Inactive"}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="mb-3 flex justify-end">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openEditDepartmentDialog(department)}
                                        >
                                            <PencilLine className="mr-2 h-4 w-4" />
                                            Edit
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        <AnimatePresence mode="popLayout">
                                            {departmentAdvisers.map((adviser) => (
                                                <motion.div
                                                    key={adviser.id}
                                                    layout
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: 20 }}
                                                    className="flex items-center justify-between p-3 bg-muted rounded-lg group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="w-8 h-8">
                                                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                                                {getInitials(adviser.name)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <p className="text-sm font-medium text-foreground">{adviser.name}</p>
                                                            <p className="text-xs text-muted-foreground">{adviser.email ?? "No email"}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge
                                                            className={
                                                                adviser.isActive
                                                                    ? "bg-green-500/10 text-green-600"
                                                                    : "bg-red-500/10 text-red-600"
                                                            }
                                                        >
                                                            {adviser.isActive ? "Active" : "Inactive"}
                                                        </Badge>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => void handleUnassign(adviser)}
                                                            disabled={isUpdatingAssignment || isSelectedSchoolYearClosed}
                                                        >
                                                            <X className="w-4 h-4 text-muted-foreground" />
                                                        </Button>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                        {departmentAdvisers.length === 0 ? (
                                            <p className="text-center text-sm text-muted-foreground py-4">
                                                No advisers assigned to this department
                                            </p>
                                        ) : null}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </motion.div>
            {filteredDepartments.length === 0 ? (
                <motion.div variants={fadeInUp}>
                    <Card>
                        <CardContent className="p-6 text-sm text-muted-foreground">
                            No departments matched your search.
                        </CardContent>
                    </Card>
                </motion.div>
            ) : null}

            <motion.div variants={fadeInUp}>
                <Card className="border-0 shadow-md bg-linear-to-br from-primary/5 to-background">
                    <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">Assignment Overview</h3>
                                <p className="text-sm text-muted-foreground">
                                    {searchQuery.trim()
                                        ? `${visibleAssignedAdvisersCount} of ${visibleAdvisersTotal} visible advisers assigned`
                                        : `${assignedAdvisersCount} of ${advisers.length} advisers assigned`}
                                </p>
                            </div>
                            <div className="flex gap-4">
                                {filteredDepartments.map((department) => (
                                    <div key={department.id} className="text-center">
                                        <div className="text-2xl font-bold text-primary">
                                            {searchQuery.trim()
                                                ? getVisibleAdvisersByDepartment(department).length
                                                : getDepartmentAdviserCount(department.value)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{department.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            <DepartmentFormDialog
                open={isAddDepartmentDialogOpen}
                onOpenChange={setIsAddDepartmentDialogOpen}
                title="Add Department"
                submitLabel="Add Department"
                submittingLabel="Adding..."
                form={addDepartmentForm}
                onChange={setAddDepartmentForm}
                error={departmentFormError}
                isSubmitting={isAddingDepartment}
                onSubmit={handleAddDepartment}
            />

            <DepartmentFormDialog
                open={isEditDepartmentDialogOpen}
                onOpenChange={setIsEditDepartmentDialogOpen}
                title="Edit Department"
                description="Update department information."
                submitLabel="Save Changes"
                submittingLabel="Saving..."
                form={editDepartmentForm}
                onChange={setEditDepartmentForm}
                showStatus
                statusValue={editDepartmentIsActive ? "active" : "inactive"}
                onStatusChange={(value) => setEditDepartmentIsActive(value === "active")}
                error={editDepartmentFormError}
                isSubmitting={isEditingDepartment}
                onSubmit={handleEditDepartment}
            />

            <AssignDepartmentDialog
                open={isAssignDialogOpen}
                onOpenChange={setIsAssignDialogOpen}
                selectedAdviserName={selectedAdviser?.name ?? null}
                selectedDepartment={selectedDepartment}
                selectedSchoolYearName={selectedSchoolYearName}
                onValueChange={setSelectedDepartment}
                departments={departments}
                getDepartmentAdviserCount={getDepartmentAdviserCount}
                isSubmitting={isUpdatingAssignment}
                isSubmissionDisabled={isSelectedSchoolYearClosed || !selectedSchoolYearId}
                onSubmit={handleAssignDepartment}
            />
        </motion.div>
    );
}
