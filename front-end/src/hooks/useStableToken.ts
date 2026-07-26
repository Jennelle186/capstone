"use client";

import { useRef, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";

export function useStableToken() {
  const { getToken } = useAuth();
  const ref = useRef(getToken);
  useEffect(() => {
    ref.current = getToken;
  });
  return ref;
}
