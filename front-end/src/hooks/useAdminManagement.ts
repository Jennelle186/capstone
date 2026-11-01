"use client";

import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { AdviserApiResponse } from "@/types/adviser";
import type {
    AdminInvitationRecord,
    AdminInvitePayload,
    AdminRecord,
    AdviserCandidate,
} from "@/types/adminManagement";

export function useAdminManagement() {
    const { isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useStableToken();

    const [admins, setAdmins] = useState<AdminRecord[]>([]);
    const [invitations, setInvitations] = useState<AdminInvitationRecord[]>([]);
    const [adviserCandidates, setAdviserCandidates] = useState<AdviserCandidate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [inviting, setInviting] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [promotingId, setPromotingId] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const requestWithAdminAuth = useCallback(
        async (path: string, init?: RequestInit): Promise<unknown> => {
            const token = await getTokenRef.current();
            if (!token) throw new Error("Missing admin authentication token.");
            const response = await fetchWithClerkAuth(path, token, init);
            if (!response.ok) {
                let message = `Request failed with status ${response.status}.`;
                try {
                    const payload = (await response.json()) as { detail?: unknown };
                    if (payload && typeof payload.detail === "string") message = payload.detail;
                } catch {
                    // Ignore malformed response bodies.
                }
                throw new Error(message);
            }
            return response.status === 204 ? null : await response.json();
        },
        [getTokenRef],
    );

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [adminsRes, invitationsRes, advisersRes] = await Promise.all([
                requestWithAdminAuth("/api/admin/admins"),
                requestWithAdminAuth("/api/admin/admins/invitations"),
                requestWithAdminAuth("/api/admin/advisers"),
            ]);
            setAdmins((adminsRes as AdminRecord[]) ?? []);
            setInvitations((invitationsRes as AdminInvitationRecord[]) ?? []);
            setAdviserCandidates(
                ((advisersRes as AdviserApiResponse[]) ?? []).map((adviser) => ({
                    id: adviser.id,
                    name: adviser.name,
                    email: adviser.email,
                })),
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load administrators.");
        } finally {
            setIsLoading(false);
        }
    }, [requestWithAdminAuth]);

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            void loadData();
        }
    }, [isLoaded, isSignedIn, loadData]);

    const inviteAdmin = useCallback(
        async (payload: AdminInvitePayload) => {
            setInviting(true);
            try {
                const created = (await requestWithAdminAuth("/api/admin/admins/invite", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })) as AdminInvitationRecord;
                toast.success(`Invitation sent to ${payload.email}.`);
                setInvitations((prev) => [created, ...prev]);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to send invitation.");
            } finally {
                setInviting(false);
            }
        },
        [requestWithAdminAuth],
    );

    const revokeInvitation = useCallback(
        async (id: string) => {
            setRevokingId(id);
            try {
                await requestWithAdminAuth(`/api/admin/admins/invitations/${id}/revoke`, {
                    method: "POST",
                });
                toast.success("Invitation revoked.");
                setInvitations((prev) =>
                    prev.map((inv) => (inv.id === id ? { ...inv, status: "revoked" as const } : inv)),
                );
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to revoke invitation.");
            } finally {
                setRevokingId(null);
            }
        },
        [requestWithAdminAuth],
    );

    const promoteAdviser = useCallback(
        async (id: string) => {
            setPromotingId(id);
            try {
                await requestWithAdminAuth("/api/admin/admins/promote", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ adviser_id: id }),
                });
                toast.success("Adviser promoted to administrator.");
                setAdviserCandidates((prev) => prev.filter((adviser) => adviser.id !== id));
                await loadData();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to promote adviser.");
            } finally {
                setPromotingId(null);
            }
        },
        [requestWithAdminAuth, loadData],
    );

    const removeAdmin = useCallback(
        async (id: string) => {
            setRemovingId(id);
            try {
                await requestWithAdminAuth(`/api/admin/admins/${id}`, { method: "DELETE" });
                toast.success("Administrator removed.");
                setAdmins((prev) => prev.filter((admin) => admin.id !== id));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to remove administrator.");
            } finally {
                setRemovingId(null);
            }
        },
        [requestWithAdminAuth],
    );

    return {
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
    };
}
