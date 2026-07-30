"use client";

import { useState } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";

export function useUpdateStudentClassification() {
  const getTokenRef = useStableToken();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateClassification = async (studentId: string, classification: string) => {
    setIsUpdating(true);
    try {
      const token = await getTokenRef.current();
      if (!token) throw new Error("Not authenticated");
      const res = await fetchWithClerkAuth(
        `/api/adviser/students/${studentId}/classification`,
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classification }),
        }
      );
      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateClassification, isUpdating };
}
