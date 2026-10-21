// Tests use MMKV's own in-memory stand-in; its native half isn't there under Jest
export { createMockMMKV as createMMKV } from "react-native-mmkv/lib/createMMKV/createMockMMKV";
