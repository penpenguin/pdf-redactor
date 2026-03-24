import { describe, expect, it } from "vitest";

import {
  appendGroup,
  clearGroups,
  removeItemsFromGroups,
  toListEntries,
} from "./redaction-groups.js";

function makeItem(overrides = {}) {
  return {
    id: overrides.id ?? "item-1",
    page: overrides.page ?? 0,
    kind: overrides.kind ?? "text",
    text: overrides.text ?? "secret",
    rect: overrides.rect ?? { left: 0.1, top: 0.2, width: 0.3, height: 0.1 },
    rects: overrides.rects ?? [{ left: 0.1, top: 0.2, width: 0.3, height: 0.1 }],
    source: "annotation",
    markColor: "#d97706",
    redactionColor: "#111827",
  };
}

describe("redaction-groups", () => {
  it("追加イベントごとにグループを積む", () => {
    const first = appendGroup([], [
      makeItem({ id: "a-1", page: 0, text: "alpha" }),
      makeItem({ id: "a-2", page: 1, text: "alpha" }),
    ]);
    const second = appendGroup(first, [makeItem({ id: "b-1", page: 0, text: "beta" })]);

    expect(second).toHaveLength(2);
    expect(second[0].text).toBe("alpha");
    expect(second[0].items.map((item) => item.id)).toEqual(["a-1", "a-2"]);
    expect(second[1].text).toBe("beta");
    expect(second[1].items.map((item) => item.id)).toEqual(["b-1"]);
  });

  it("削除済み item を取り除き、空グループは消す", () => {
    const groups = appendGroup(
      appendGroup([], [makeItem({ id: "a-1" }), makeItem({ id: "a-2" })]),
      [makeItem({ id: "b-1", text: "beta" })]
    );

    const result = removeItemsFromGroups(groups, [
      { page: 0, id: "a-1" },
      { page: 0, id: "b-1" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].items.map((item) => item.id)).toEqual(["a-2"]);
  });

  it("一覧表示向けにページ集合と件数を整形する", () => {
    const groups = appendGroup([], [
      makeItem({ id: "a-1", page: 2, text: "alpha" }),
      makeItem({ id: "a-2", page: 0, text: "alpha" }),
      makeItem({ id: "a-3", page: 2, text: "alpha" }),
    ]);

    expect(toListEntries(groups)).toEqual([
      {
        groupId: expect.any(String),
        text: "alpha",
        pages: [1, 3],
        count: 3,
      },
    ]);
  });

  it("全消去で空配列を返す", () => {
    const groups = appendGroup([], [makeItem()]);
    expect(clearGroups(groups)).toEqual([]);
  });

  it("同一 item 群の重複追加を無視する", () => {
    const items = [makeItem({ id: "a-1", page: 0, text: "alpha" })];
    const once = appendGroup([], items);
    const duplicated = appendGroup(once, items);

    expect(duplicated).toHaveLength(1);
  });
});
