import { useEffect, useState } from "react";
import { onlineManager } from "@tanstack/react-query";

// Tracks device network connectivity with automatic listener updates
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return onlineManager.isOnline();
  });

  useEffect(() => {
    const unsubscribe = onlineManager.subscribe((online) => {
      setIsOnline(online);
    });

    if (typeof window !== "undefined" && window.addEventListener) {
      const handleOnline = () => {
        setIsOnline(true);
        onlineManager.setOnline(true);
      };
      const handleOffline = () => {
        setIsOnline(false);
        onlineManager.setOnline(false);
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      const interval = setInterval(() => {
        const navOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
        if (navOnline !== onlineManager.isOnline()) {
          setIsOnline(navOnline);
          onlineManager.setOnline(navOnline);
        }
      }, 3000);

      return () => {
        unsubscribe();
        clearInterval(interval);
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    return unsubscribe;
  }, []);

  return isOnline;
}

