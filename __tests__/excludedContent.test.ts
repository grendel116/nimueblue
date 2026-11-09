import { isExcludedContent } from "@/queries/excludedContent";

describe("fascist movement filter", () => {
  test("blocks Nazi, white-nationalist and Christian-nationalist names and tags", () => {
    expect(isExcludedContent(["Christian Nationalist Radio"])).toBe(true);
    expect(isExcludedContent(["Faith Radio"], ["christian nationalism"])).toBe(true);
    expect(isExcludedContent(["White Pride Worldwide"])).toBe(true);
    expect(isExcludedContent(["Neo-Nazi Hour"])).toBe(true);
    expect(isExcludedContent(["National Socialist Radio"])).toBe(true);
    expect(isExcludedContent(["Alt-Right Talk"])).toBe(true);
    expect(isExcludedContent(["Patriot Radio Network"])).toBe(true);
    expect(isExcludedContent(["American Patriots Live"])).toBe(true);
    expect(isExcludedContent(["Make America Great Radio"])).toBe(true);
    expect(isExcludedContent(["MAGA Morning"])).toBe(true);
    expect(isExcludedContent(["The Alex Jones Show"])).toBe(true);
    expect(isExcludedContent(["Infowars"])).toBe(true);
    expect(isExcludedContent(["Newsmax Radio"])).toBe(true);
  });

  test("keeps anti-fascist shows and ordinary uses of America", () => {
    expect(isExcludedContent(["Anti-Nazi Radio"])).toBe(false);
    expect(isExcludedContent(["Antifascist Broadcast"])).toBe(false);
    expect(isExcludedContent(["Americana Roots Radio"])).toBe(false);
    expect(isExcludedContent(["Latin America Libre"])).toBe(false);
    expect(isExcludedContent(["Native America Calling"])).toBe(false);
    expect(isExcludedContent(["Radio Free America"])).toBe(false);
    expect(isExcludedContent(["Christian Gospel Hour"], ["christian", "gospel"])).toBe(false);
  });
});
