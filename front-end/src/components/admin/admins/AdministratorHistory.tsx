"use client";

import { Loader2, History } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useAdministratorHistory } from "@/hooks/useAdministratorHistory";
import {
    ADMIN_HISTORY_EVENT_LABELS,
    ADMIN_HISTORY_STATUS_LABELS,
    type AdminHistoryPerson,
    type AdminHistoryStatus,
} from "@/types/adminHistory";

const STATUS_STYLES: Record<AdminHistoryStatus, string> = {
    admin: "bg-green-500/10 text-green-700",
    invited: "bg-amber-500/10 text-amber-700",
    revoked: "bg-rose-500/10 text-rose-700",
    removed: "bg-slate-500/10 text-slate-600",
};

function formatDateTime(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

/** One row per event, newest first, so each step has its date, person and actor in its own column. */
function flattenEvents(people: AdminHistoryPerson[]) {
    return people
        .flatMap((person) => person.events.map((event) => ({ person, event })))
        .sort((a, b) => new Date(b.event.at).getTime() - new Date(a.event.at).getTime());
}

export default function AdministratorHistory() {
    const { people, isLoading } = useAdministratorHistory();

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading administrator history…
            </div>
        );
    }

    if (people.length === 0) {
        return (
            <AdminEmptyState
                className="py-12"
                icon={<History className="h-12 w-12 text-muted-foreground" />}
                title="No administrator history yet"
                description="Invitations, promotions and removals will appear here."
            />
        );
    }

    const rows = flattenEvents(people);

    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Person</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Done by</TableHead>
                        <TableHead>Current status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(({ person, event }, index) => (
                        <TableRow key={`${person.email ?? person.name ?? "unknown"}-${event.type}-${event.at}-${index}`}>
                            <TableCell className="whitespace-nowrap text-sm">{formatDateTime(event.at)}</TableCell>
                            <TableCell>
                                <div className="text-sm font-medium">{person.name ?? person.email ?? "Unknown"}</div>
                                {person.email && person.name !== person.email ? (
                                    <div className="text-xs text-muted-foreground">{person.email}</div>
                                ) : null}
                            </TableCell>
                            <TableCell className="text-sm">{ADMIN_HISTORY_EVENT_LABELS[event.type]}</TableCell>
                            <TableCell className="text-sm">{event.actor_name ?? "—"}</TableCell>
                            <TableCell>
                                <Badge className={`${STATUS_STYLES[person.status]} border-0 text-xs`}>
                                    {ADMIN_HISTORY_STATUS_LABELS[person.status]}
                                </Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
