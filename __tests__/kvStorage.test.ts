import { kvStorage } from "@/scripts/storage/kvStorage";

describe("kvStorage adapter", () => {
  beforeEach(() => {
    kvStorage.clearAll();
  });

  test("can set and get strings synchronously", () => {
    expect(kvStorage.getString("test_key")).toBeUndefined();
    kvStorage.set("test_key", "hello world");
    expect(kvStorage.getString("test_key")).toBe("hello world");
  });

  test("can overwrite existing values", () => {
    kvStorage.set("key1", "val1");
    expect(kvStorage.getString("key1")).toBe("val1");
    kvStorage.set("key1", "val2");
    expect(kvStorage.getString("key1")).toBe("val2");
  });

  test("can delete values", () => {
    kvStorage.set("to_delete", "xyz");
    expect(kvStorage.getString("to_delete")).toBe("xyz");
    kvStorage.delete("to_delete");
    expect(kvStorage.getString("to_delete")).toBeUndefined();
  });
});
