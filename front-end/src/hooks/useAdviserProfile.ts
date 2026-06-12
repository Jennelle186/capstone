import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { fetchWithClerkAuth } from "@/lib/api";
import type { AdviserProfileResponse } from "@/types/adviser";

interface UseAdviserProfileResult {
  profile: AdviserProfileResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAdviserProfile(): UseAdviserProfileResult {
  const { getToken } = useAuth();
  const [profile, setProfile] = useState<AdviserProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = await getToken();
      if (!token) {
        throw new Error("Authentication token not available");
      }
      const response = await fetchWithClerkAuth("/api/adviser/profile", token);
      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`);
      }
      const payload = (await response.json()) as AdviserProfileResponse;
      setProfile(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, isLoading, error, refetch: fetchProfile };
}
