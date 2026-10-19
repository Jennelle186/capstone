import { useEffect, useState } from "react";

import { API_BASE_URL } from "@/config/api";
import type { PublicBranding } from "@/types/branding";

/**
 * Public branding (institution name/address/contact + logo URL).
 *
 * Loaded unauthenticated so auth, loading, and print surfaces can render the
 * institution logo before sign-in. Falls back to the bundled logo when the
 * backend has no branding row yet. Results are cached module-wide so the many
 * sidebar/auth instances share one request.
 */
export const FALLBACK_BRANDING: PublicBranding = {
    institution_name: "College of Computer Studies",
    address_lines: [],
    contact_line: null,
    logo_url: "/ccs-logo.jpg",
};

let cache: PublicBranding | null = null;
let inFlight: Promise<PublicBranding> | null = null;

async function fetchBranding(): Promise<PublicBranding> {
    if (cache) return cache;
    if (!inFlight) {
        inFlight = (async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/public/branding`);
                if (!res.ok) throw new Error(`Branding request failed (${res.status}).`);
                const payload = (await res.json()) as PublicBranding;
                cache = {
                    institution_name: payload.institution_name || FALLBACK_BRANDING.institution_name,
                    address_lines: payload.address_lines ?? [],
                    contact_line: payload.contact_line ?? null,
                    logo_url: payload.logo_url || FALLBACK_BRANDING.logo_url,
                };
            } catch {
                cache = FALLBACK_BRANDING;
            } finally {
                inFlight = null;
            }
            return cache;
        })();
    }
    return inFlight;
}

/** Clear the cached branding (call after an admin saves new branding). */
export function invalidateBrandingCache(): void {
    cache = null;
}

export function usePublicBranding(): { branding: PublicBranding; isLoading: boolean } {
    const [branding, setBranding] = useState<PublicBranding>(cache ?? FALLBACK_BRANDING);
    const [isLoading, setIsLoading] = useState(cache === null);

    useEffect(() => {
        let cancelled = false;
        void fetchBranding().then((value) => {
            if (cancelled) return;
            setBranding(value);
            setIsLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return { branding, isLoading };
}
