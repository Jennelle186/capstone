import { useSyncExternalStore } from "react";

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

export function useMediaQuery(query: string): boolean {
  const getSnapshot = () => window.matchMedia(query).matches;
  const getServerSnapshot = () => false;

  const subscribe = (onStoreChange: () => void) => {
    const media = window.matchMedia(query) as LegacyMediaQueryList;
    const handler = () => onStoreChange();

    if (media.addEventListener) {
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }

    media.addListener?.(handler);
    return () => media.removeListener?.(handler);
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

