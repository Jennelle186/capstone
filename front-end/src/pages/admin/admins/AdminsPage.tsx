"use client";

import { useState } from "react";
import { Loader2, Mail, Shield, ShieldCheck, UserPlus, UserMinus } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminInviteDialog from "@/components/admin/admins/AdminInviteDialog";
import AdministratorHistory from "@/components/admin/admins/AdministratorHistory";
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
import { useAdminManagement } from "@/hooks/useAdminManagement";
import type { AdminInvitationStatus } from "@/types/adminManagement";

type Tab = "admins" | "invitations" | "promote" | "history";

const INVITATION_STATUS_STYLES: Record<AdminInvitationStatus, string> = {
    pending: "bg-amber-500/10 text-amber-700",
    accepted: "bg-green-500/10 text-green-700",
    revoked: "bg-rose-500/10 text-rose-700",
    expired: "bg-slate-500/10 text-slate-600",
};

function formatDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fullName(
    first: string | null,
    middle: string | null,
    last: string | null,
): string {
    return [first, middle, last].filter(Boolean).join(" ") || "—";
}

function formatStatus(value: AdminInvitationStatus): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function AdminsPage() {
    const {
        admins,
        invitations,
        adviserCandidates,
        isLoading,
        inviting,
        revokingId,
        promotingId,
        removingId,
        inviteAdmin,
        revokeInvitation,
        promoteAdviser,
        removeAdmin,
    } = useAdminManagement();

    const [activeTab, setActiveTab] = useState<Tab>("admins");
    const [inviteOpen, setInviteOpen] = useState(false);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading administrators…
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Administrators"
                description="Manage who has administrator access to the system."
                actions={
                    <Button onClick={() => setInviteOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Invite Administrator
                    </Button>
                }
            />

            <div className="inline-flex rounded-lg border bg-muted/30 p-1">
                <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "admins" ? "default" : "ghost"}
                    onClick={() => setActiveTab("admins")}
                >
                    Administrators
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "invitations" ? "default" : "ghost"}
                    onClick={() => setActiveTab("invitations")}
                >
                    Invitations
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "promote" ? "default" : "ghost"}
                    onClick={() => setActiveTab("promote")}
                >
                    Promote Adviser
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "history" ? "default" : "ghost"}
                    onClick={() => setActiveTab("history")}
                >
                    History
                </Button>
            </div>

            {activeTab === "history" && <AdministratorHistory />}

            {activeTab === "admins" && (
                <div className="rounded-lg border">
                    {admins.length === 0 ? (
                        <AdminEmptyState
                            className="py-12"
                            icon={<ShieldCheck className="h-12 w-12 text-muted-foreground" />}
                            title="No administrators found"
                            description="Invite an administrator to grant them access."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Added</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {admins.map((admin) => (
                                    <TableRow key={admin.id}>
                                        <TableCell className="font-medium">{admin.name}</TableCell>
                                        <TableCell>{admin.email ?? "No email"}</TableCell>
                                        <TableCell>{formatDate(admin.created_at)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                disabled={removingId === admin.id}
                                                onClick={() => void removeAdmin(admin.id)}
                                            >
                                                <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                                                {removingId === admin.id ? "Removing…" : "Remove"}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            )}

            {activeTab === "invitations" && (
                <div className="rounded-lg border">
                    {invitations.length === 0 ? (
                        <AdminEmptyState
                            className="py-12"
                            icon={<Mail className="h-12 w-12 text-muted-foreground" />}
                            title="No invitations yet"
                            description="Invite an administrator to get started."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Sent</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invitations.map((inv) => (
                                    <TableRow key={inv.id}>
                                        <TableCell className="font-medium">{inv.email}</TableCell>
                                        <TableCell>
                                            {fullName(inv.first_name, inv.middle_name, inv.last_name)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={INVITATION_STATUS_STYLES[inv.status]}>
                                                {formatStatus(inv.status)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{formatDate(inv.created_at)}</TableCell>
                                        <TableCell className="text-right">
                                            {inv.status === "pending" && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    disabled={revokingId === inv.id}
                                                    onClick={() => void revokeInvitation(inv.id)}
                                                >
                                                    {revokingId === inv.id ? "Revoking…" : "Revoke"}
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            )}

            {activeTab === "promote" && (
                <div className="rounded-lg border">
                    {adviserCandidates.length === 0 ? (
                        <AdminEmptyState
                            className="py-12"
                            icon={<Shield className="h-12 w-12 text-muted-foreground" />}
                            title="No advisers to promote"
                            description="Advisers will appear here once they exist in the system."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {adviserCandidates.map((adviser) => (
                                    <TableRow key={adviser.id}>
                                        <TableCell className="font-medium">{adviser.name}</TableCell>
                                        <TableCell>{adviser.email ?? "No email"}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={promotingId === adviser.id}
                                                onClick={() => void promoteAdviser(adviser.id)}
                                            >
                                                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                                                {promotingId === adviser.id
                                                    ? "Promoting…"
                                                    : "Promote to Admin"}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            )}

            <AdminInviteDialog
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                isSubmitting={inviting}
                onSubmit={(payload) => void inviteAdmin(payload)}
            />
        </div>
    );
}
