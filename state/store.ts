import { useRef, useSyncExternalStore } from "react";

export type Store<T> = {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  useStore: <S = T>(selector?: (state: T) => S) => S;
  usePick: <K extends keyof T>(...keys: K[]) => Pick<T, K>;
};

// Creates a lightweight reactive store. Subscribed components redraw through useSyncExternalStore.
// `useStore(selector)` redraws only when the selected slice changes.
// `usePick(...keys)` redraws only when one of the specified properties changes.
export function createStore<T>(initial: T): Store<T> {
  let current = initial;
  const listeners = new Set<() => void>();

  const get = () => current;

  const set = (next: T | ((prev: T) => T)) => {
    const nextVal = typeof next === "function" ? (next as (prev: T) => T)(current) : next;
    if (Object.is(current, nextVal)) return;
    current = nextVal;
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  function useStore<S = T>(selector?: (state: T) => S): S {
    const sel = selector || ((s: T) => s as unknown as S);
    const lastSlice = useRef<S | undefined>(undefined);
    return useSyncExternalStore(subscribe, () => {
      const nextSlice = sel(current);
      if (lastSlice.current !== undefined && Object.is(lastSlice.current, nextSlice)) {
        return lastSlice.current;
      }
      lastSlice.current = nextSlice;
      return nextSlice;
    });
  }

  function usePick<K extends keyof T>(...keys: K[]): Pick<T, K> {
    const picked = useRef<Pick<T, K> | undefined>(undefined);
    return useSyncExternalStore(subscribe, () => {
      const previous = picked.current;
      if (previous && keys.every((k) => Object.is(previous[k], current[k]))) {
        return previous;
      }
      const next = {} as Pick<T, K>;
      for (const k of keys) next[k] = current[k];
      picked.current = next;
      return next;
    });
  }

  return { get, set, subscribe, useStore, usePick };
}
