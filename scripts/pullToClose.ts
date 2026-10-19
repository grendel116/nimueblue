import type { RefObject } from "react";

// Phones and tablets pull sheets down with the gesture handler, so nothing extra is needed here
export function usePullToClose(
  _sheetRef: RefObject<unknown>,
  _enabled: boolean,
  _handlers: { onPull: (distance: number) => void; onRelease: (velocity: number) => void },
) {}
