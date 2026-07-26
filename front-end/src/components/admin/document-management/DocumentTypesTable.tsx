import { motion } from "framer-motion";
import { ArchiveRestore, PencilLine, Trash2 } from "lucide-react";

import StatusBadge from "@/components/admin/document-management/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type { DocumentTypeItem, StudentClassification } from "@/types/documentType";

interface DocumentTypesTableProps {
    items: DocumentTypeItem[];
    onEdit: (item: DocumentTypeItem) => void;
    onArchive: (item: DocumentTypeItem) => void;
    onRestore: (item: DocumentTypeItem) => void;
}

function isArchived(item: DocumentTypeItem): boolean {
    return item.isArchived || !item.isActive;
}

const CLASSIFICATION_LABELS: Record<StudentClassification, string> = {
    freshman: "Freshman",
    transferee: "Transferee",
    shifter: "Shifter",
    returning: "Returning / Continuing",
    cross_enrollee: "Cross-Enrolee",
};

export default function DocumentTypesTable({
    items,
    onEdit,
    onArchive,
    onRestore,
}: DocumentTypesTableProps) {
    return (
        <Table className="table-fixed min-w-[1120px]">
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[17%] whitespace-normal">Name</TableHead>
                    <TableHead className="w-[12%] whitespace-normal">Code</TableHead>
                    <TableHead className="w-[27%] whitespace-normal">Description</TableHead>
                    <TableHead className="w-[14%] whitespace-normal">Classification Status</TableHead>
                    <TableHead className="w-[10%] whitespace-normal">Status</TableHead>
                    <TableHead className="w-[20%] whitespace-normal text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((item, index) => {
                    const archived = isArchived(item);
                    const classifications = item.applicableClassifications || [];

                    return (
                        <TableRow key={item.id} className="align-top">
                            <TableCell>
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.18, delay: index * 0.03 }}
                                    className="font-medium whitespace-normal break-words leading-relaxed"
                                >
                                    {item.name}
                                </motion.div>
                            </TableCell>
                            <TableCell className="font-mono text-xs whitespace-normal break-all leading-relaxed">
                                {item.code}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words leading-relaxed text-muted-foreground">
                                {item.description}
                            </TableCell>
                            <TableCell>
                                {classifications.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                        {classifications.map((classification) => (
                                            <Badge key={classification} variant="secondary" className="text-xs">
                                                {CLASSIFICATION_LABELS[classification]}
                                            </Badge>
                                        ))}
                                    </div>
                                ) : (
                                    <StatusBadge kind="incomplete" />
                                )}
                            </TableCell>
                            <TableCell>
                                {archived ? <StatusBadge kind="archived" /> : <StatusBadge kind="active" />}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                                <div className="flex flex-wrap justify-end gap-2">
                                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => onEdit(item)}>
                                        <PencilLine className="mr-2 h-4 w-4" />
                                        Edit
                                    </Button>
                                    {archived ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                                            onClick={() => onRestore(item)}
                                        >
                                            <ArchiveRestore className="mr-2 h-4 w-4" />
                                            Restore
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 text-destructive hover:text-destructive"
                                            onClick={() => onArchive(item)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Archive
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
