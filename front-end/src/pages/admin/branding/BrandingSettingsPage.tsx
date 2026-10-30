"use client";

import { useAuth } from "@clerk/clerk-react";
import { ImageUp, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithClerkAuth } from "@/lib/api";
import { invalidateBrandingCache } from "@/hooks/usePublicBranding";
import type { AdminBranding, BrandingUpdatePayload, LogoUploadTarget } from "@/types/branding";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export default function BrandingSettingsPage() {
    const { getToken } = useAuth();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [branding, setBranding] = useState<AdminBranding | null>(null);
    const [institutionName, setInstitutionName] = useState("");
    const [addressLines, setAddressLines] = useState("");
    const [contactLine, setContactLine] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const request = useCallback(
        async (path: string, init?: RequestInit): Promise<Response> => {
            const token = await getToken();
            if (!token) throw new Error("Missing admin authentication token.");
            return fetchWithClerkAuth(path, token, init);
        },
        [getToken],
    );

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await request("/api/admin/branding/settings");
            if (!res.ok) throw new Error(`Failed to load branding (${res.status}).`);
            const payload = (await res.json()) as AdminBranding;
            setBranding(payload);
            setInstitutionName(payload.institution_name ?? "");
            setAddressLines((payload.address_lines ?? []).join("\n"));
            setContactLine(payload.contact_line ?? "");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load branding.");
        } finally {
            setIsLoading(false);
        }
    }, [request]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload: BrandingUpdatePayload = {
                institution_name: institutionName.trim() || null,
                address_lines: addressLines.split("\n").map((line) => line.trim()).filter(Boolean),
                contact_line: contactLine.trim() || null,
            };
            const res = await request("/api/admin/branding/settings", {
                method: "PATCH",
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`Save failed (${res.status}).`);
            const updated = (await res.json()) as AdminBranding;
            setBranding(updated);
            invalidateBrandingCache();
            toast.success("Branding saved.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save branding.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogoSelected = async (file: File) => {
        if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
            toast.error("Use a PNG, JPEG, WebP, or SVG logo.");
            return;
        }
        if (file.size > MAX_LOGO_BYTES) {
            toast.error("Logo must be 5 MB or smaller.");
            return;
        }

        setIsUploading(true);
        try {
            const targetRes = await request("/api/admin/branding/logo/upload-url", {
                method: "POST",
                body: JSON.stringify({ content_type: file.type, filename: file.name }),
            });
            if (!targetRes.ok) throw new Error(`Could not prepare upload (${targetRes.status}).`);
            const target = (await targetRes.json()) as LogoUploadTarget;

            const putRes = await fetch(target.upload_url, {
                method: "PUT",
                body: file,
                headers: { "Content-Type": target.content_type },
            });
            if (!putRes.ok) throw new Error(`Logo upload failed (${putRes.status}).`);

            const confirmRes = await request(`/api/admin/branding/logo/${target.file_key}/confirm`, {
                method: "POST",
            });
            if (!confirmRes.ok) throw new Error(`Could not confirm logo (${confirmRes.status}).`);

            setBranding((await confirmRes.json()) as AdminBranding);
            invalidateBrandingCache();
            toast.success("Logo updated.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to upload logo.");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-[300px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <h1 className="text-lg font-semibold text-slate-900">Branding</h1>
                <p className="text-sm text-slate-500">
                    Global institution identity used by the letterhead, auth screens, loading screen, and navigation.
                </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-5">
                    <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {branding?.logo_url ? (
                            <img src={branding.logo_url} alt="Institution logo" className="h-full w-full object-contain" />
                        ) : (
                            <ImageUp className="h-7 w-7 text-slate-300" />
                        )}
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-700">Institution logo</p>
                        <p className="text-xs text-slate-400">PNG, JPEG, WebP, or SVG · up to 5 MB.</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ALLOWED_LOGO_TYPES.join(",")}
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleLogoSelected(file);
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={isUploading}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
                            {isUploading ? "Uploading…" : "Upload logo"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="space-y-1.5">
                    <Label htmlFor="branding-name">Institution name</Label>
                    <Input
                        id="branding-name"
                        value={institutionName}
                        onChange={(e) => setInstitutionName(e.target.value)}
                        placeholder="College of Computer Studies"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="branding-address">Address lines</Label>
                    <Textarea
                        id="branding-address"
                        value={addressLines}
                        onChange={(e) => setAddressLines(e.target.value)}
                        placeholder={"Campus Address\nCity, Province"}
                        rows={3}
                    />
                    <p className="text-[11px] text-slate-400">One line per row. Used on the form letterhead.</p>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="branding-contact">Contact line</Label>
                    <Input
                        id="branding-contact"
                        value={contactLine}
                        onChange={(e) => setContactLine(e.target.value)}
                        placeholder="registrar@example.edu · (000) 000-0000"
                    />
                </div>

                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving} className="gap-1.5">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {isSaving ? "Saving…" : "Save branding"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
