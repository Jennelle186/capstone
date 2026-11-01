// Types for the Admin Management module (list / invite / promote / remove admins).

export interface AdminRecord {
    id: string;
    name: string;
    email: string | null;
    created_at: string;
    updated_at: string;
}

export type AdminInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface AdminInvitationRecord {
    id: string;
    email: string;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    status: AdminInvitationStatus;
    invited_by_user_id: string | null;
    accepted_user_id: string | null;
    expires_at: string | null;
    accepted_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface AdminInvitePayload {
    email: string;
    first_name: string;
    middle_name: string;
    last_name: string;
}

export interface AdviserCandidate {
    id: string;
    name: string;
    email: string | null;
}
