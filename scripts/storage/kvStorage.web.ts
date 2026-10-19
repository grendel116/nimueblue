export interface KeyValueStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
  clearAll: () => void;
}

const memoryMap = new Map<string, string>();

export const kvStorage: KeyValueStorage = {
  getString: (key: string): string | undefined => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const val = window.localStorage.getItem(key);
        return val !== null ? val : undefined;
      }
    } catch {
      // Fallback if localStorage is disabled or throws (e.g. Safari private browsing)
    }
    return memoryMap.get(key);
  },
  set: (key: string, value: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Fallback
    }
    memoryMap.set(key, value);
  },
  delete: (key: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // Fallback
    }
    memoryMap.delete(key);
  },
  clearAll: (): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.clear();
        return;
      }
    } catch {
      // Fallback
    }
    memoryMap.clear();
  },
};
