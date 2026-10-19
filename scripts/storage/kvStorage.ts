import { Platform } from "react-native";

export interface KeyValueStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
  clearAll: () => void;
}

const memoryMap = new Map<string, string>();

const memoryStorage: KeyValueStorage = {
  getString: (k: string) => memoryMap.get(k),
  set: (k: string, v: string) => {
    memoryMap.set(k, v);
  },
  delete: (k: string) => {
    memoryMap.delete(k);
  },
  clearAll: () => {
    memoryMap.clear();
  },
};

function createStorage(): KeyValueStorage {
  if (Platform.OS === "web") {
    return memoryStorage;
  }

  try {
    const { MMKV } = require("react-native-mmkv");
    const mmkv = new MMKV({ id: "nimue-blue-queue" });
    return {
      getString: (k: string) => mmkv.getString(k),
      set: (k: string, v: string) => mmkv.set(k, v),
      delete: (k: string) => mmkv.delete(k),
      clearAll: () => mmkv.clearAll(),
    };
  } catch (error) {
    // In Jest environments or fallback where native JSI is not linked
    return memoryStorage;
  }
}

export const kvStorage: KeyValueStorage = createStorage();
