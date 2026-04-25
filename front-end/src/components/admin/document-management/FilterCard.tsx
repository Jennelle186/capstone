import { motion } from "framer-motion";
import { Search } from "lucide-react";

import { fadeInUp } from "@/components/admin/motion-variants";
import StatusBadge from "@/components/admin/document-management/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { DocumentTypeFilterStatus } from "@/types/documentType";

interface FilterCardProps {
    searchQuery: string;
    onSearchQueryChange: (value: string) => void;
    statusFilter: DocumentTypeFilterStatus;
    onStatusFilterChange: (value: DocumentTypeFilterStatus) => void;
    activeCount: number;
    archivedCount: number;
    totalCount: number;
}

export default function FilterCard({
    searchQuery,
    onSearchQueryChange,
    statusFilter,
    onStatusFilterChange,
    activeCount,
    archivedCount,
    totalCount,
}: FilterCardProps) {
    return (
        <motion.div variants={fadeInUp}>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Filters</CardTitle>
                    <CardDescription>Search and filter document type records.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={searchQuery}
                                onChange={(event) => onSearchQueryChange(event.target.value)}
                                placeholder="Search by name, code, description, classifier, or keyword..."
                                className="pl-9"
                            />
                        </div>
                        <Select
                            value={statusFilter}
                            onValueChange={(value) => onStatusFilterChange(value as DocumentTypeFilterStatus)}
                        >
                            <SelectTrigger className="w-full sm:w-40">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="archived">Archived</SelectItem>
                                <SelectItem value="all">All</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge kind="active" count={activeCount} label="Active" />
                        <StatusBadge kind="archived" count={archivedCount} label="Archived" />
                        <StatusBadge kind="total" count={totalCount} label="Total" />
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
