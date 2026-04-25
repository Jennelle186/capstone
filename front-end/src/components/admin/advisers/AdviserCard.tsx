import { motion } from "framer-motion";
import { Building2, CheckCircle2, Edit2, Mail, MoreVertical, Trash2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatDate, getInitials } from "@/lib/adviser-utils";
import type { Adviser } from "@/types/adviser";

interface AdviserCardProps {
    adviser: Adviser;
    isStatusUpdating: boolean;
    animationDelay: number;
    onDelete: (adviser: Adviser) => void;
    onEdit: (adviser: Adviser) => void;
    onToggleStatus: (adviser: Adviser) => void | Promise<void>;
}

// The AdviserCard component is responsible for displaying individual adviser information in a card format, 
// including their name, email, department, school year, and status. 
// It also includes a dropdown menu with actions to edit, toggle status, or delete the adviser. 
// The component uses framer-motion for animations and includes handling for the status update state to disable actions while an update is in progress.
export default function AdviserCard({
    adviser,
    isStatusUpdating,
    animationDelay,
    onDelete,
    onEdit,
    onToggleStatus,
}: AdviserCardProps) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: animationDelay }}
            whileHover={{ y: -4 }}
        >
            <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-lg font-semibold text-primary">{getInitials(adviser.name)}</span>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground">{adviser.name}</h3>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Mail className="w-3 h-3" />
                                    <span className="truncate max-w-37.5">{adviser.email ?? "No email"}</span>
                                </div>
                            </div>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <MoreVertical className="w-4 h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onEdit(adviser)}>
                                    <Edit2 className="w-4 h-4 mr-2" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => void onToggleStatus(adviser)}
                                    disabled={isStatusUpdating}
                                >
                                    {adviser.isActive ? (
                                        <>
                                            <XCircle className="w-4 h-4 mr-2" />
                                            {isStatusUpdating ? "Deactivating..." : "Deactivate"}
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            {isStatusUpdating ? "Activating..." : "Activate"}
                                        </>
                                    )}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onDelete(adviser)} className="text-destructive">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <Badge variant="outline" className="text-xs">
                                {adviser.department || "Unassigned"}
                            </Badge>
                        </div>
                        <Badge
                            className={
                                adviser.isActive
                                    ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                                    : "bg-red-500/10 text-red-600 hover:bg-red-500/20"
                            }
                        >
                            {adviser.isActive ? "Active" : "Inactive"}
                        </Badge>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>S.Y. {adviser.schoolYear ?? "N/A"}</span>
                            <span>Added {formatDate(adviser.createdAt)}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
