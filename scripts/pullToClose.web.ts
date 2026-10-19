import { useEffect, useRef, type RefObject } from "react";

// Mobile browsers take a vertical drag over a scrolling area as a page scroll and cancel
// the gesture handler's pointer events, so a sheet listens to raw touches instead. A drag
// that starts downward while everything under the finger is scrolled to its top moves the
// sheet; any other drag scrolls as usual.

type PullHandlers = {
  onPull: (distance: number) => void;
  onRelease: (velocity: number) => void;
};

// Movement under this many pixels leaves the drag's direction undecided
const DECIDE_PX = 4;

function scrolledToTop(target: EventTarget | null, sheet: HTMLElement) {
  for (let node = target as HTMLElement | null; node && node !== sheet; node = node.parentElement) {
    if (node.scrollTop > 0) return false;
  }
  return true;
}

export function usePullToClose(sheetRef: RefObject<unknown>, enabled: boolean, handlers: PullHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const sheet = sheetRef.current as HTMLElement | null;
    if (!enabled || !sheet?.addEventListener) return;

    let state: "idle" | "undecided" | "pulling" | "scrolling" = "idle";
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        state = "idle";
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = lastY = touch.clientY;
      lastTime = event.timeStamp;
      velocity = 0;
      state = scrolledToTop(event.target, sheet) ? "undecided" : "scrolling";
    };

    const onMove = (event: TouchEvent) => {
      if (state === "idle" || state === "scrolling") return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (state === "undecided") {
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
        state = dy > Math.abs(dx) ? "pulling" : "scrolling";
        if (state === "scrolling") return;
      }
      // Keeps the browser from scrolling or pulling the page while the sheet follows the finger
      event.preventDefault();
      const elapsed = event.timeStamp - lastTime;
      if (elapsed > 0) velocity = ((touch.clientY - lastY) / elapsed) * 1000;
      lastY = touch.clientY;
      lastTime = event.timeStamp;
      latest.current.onPull(Math.max(0, dy));
    };

    const onEnd = () => {
      if (state === "pulling") latest.current.onRelease(velocity);
      state = "idle";
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [sheetRef, enabled]);
}
