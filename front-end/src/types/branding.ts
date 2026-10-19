export interface PublicBranding {
    institution_name: string | null;
    address_lines: string[];
    contact_line: string | null;
    logo_url: string | null;
}

export interface AdminBranding extends PublicBranding {
    updated_at: string | null;
}

export interface BrandingUpdatePayload {
    institution_name?: string | null;
    address_lines?: string[];
    contact_line?: string | null;
}

export interface LogoUploadTarget {
    upload_url: string;
    file_key: string;
    content_type: string;
}
