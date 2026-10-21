import { createMMKV } from "react-native-mmkv";

export interface KeyValueStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
  clearAll: () => void;
}

// The phone's own fast storage. In tests MMKV hands back its built-in stand-in
const mmkv = createMMKV({ id: "nimue-blue-queue" });

export const kvStorage: KeyValueStorage = {
  getString: (k: string) => mmkv.getString(k),
  set: (k: string, v: string) => mmkv.set(k, v),
  delete: (k: string) => {
    mmkv.remove(k);
  },
  clearAll: () => mmkv.clearAll(),
};
