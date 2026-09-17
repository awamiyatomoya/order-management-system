import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPosSellingStoreGroups,
  diffMonthKeys,
  formatMonthKeyLabel,
} from "@/lib/pos-selling-stores";
import type { SelloutEntry } from "@/lib/types";

function buildEntry(overrides: Partial<SelloutEntry>): SelloutEntry {
  return {
    id: "entry",
    importId: "import",
    clientId: "client",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    retailer: "インキューブ",
    storeCode: "",
    storeName: "天神店",
    matchedStoreCode: "",
    matchedStoreName: "天神店",
    jan: "4573587783667",
    productName: "テスト商品",
    qty: 1,
    amount: 2480,
    stock: null,
    ...overrides,
  };
}

test("直近3ヶ月に実績のある店舗を販売中として集計する", () => {
  const groups = buildPosSellingStoreGroups(
    [
      // 最新月(8月)に販売 → 販売中
      buildEntry({ id: "a", storeName: "天神店", matchedStoreName: "天神店", qty: 3 }),
      // ウィンドウ内(6月)が最終販売 → 販売中
      buildEntry({
        id: "b",
        storeName: "久留米店",
        matchedStoreName: "久留米店",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
        qty: 2,
      }),
      // ウィンドウ外(4月)が最終販売 → 実績なし
      buildEntry({
        id: "c",
        storeName: "旧店舗",
        matchedStoreName: "旧店舗",
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        qty: 5,
      }),
      // 販売0の行は実売とみなさない
      buildEntry({ id: "d", storeName: "在庫のみ店", matchedStoreName: "在庫のみ店", qty: 0, amount: 0, stock: 4 }),
    ],
    { now: new Date(2026, 8, 17) },
  );

  assert.equal(groups.length, 1);
  const group = groups[0];
  assert.equal(group.retailer, "インキューブ");
  assert.equal(group.latestMonthKey, "2026-08");
  assert.equal(group.activeStoreCount, 2);
  assert.equal(group.inactiveStoreCount, 1);
  // 販売中が先、ウィンドウ内数量の多い順
  assert.deepEqual(
    group.stores.map((store) => [store.storeName, store.isActive]),
    [
      ["天神店", true],
      ["久留米店", true],
      ["旧店舗", false],
    ],
  );
  assert.equal(group.stores[2].lastSoldMonthKey, "2026-04");
  // ウィンドウ外の数量は直近販売数に含めない
  assert.equal(group.stores[2].recentQty, 0);
});

test("最新POSが2ヶ月以上前なら鮮度警告を立てる", () => {
  const [freshGroup] = buildPosSellingStoreGroups(
    [buildEntry({ periodStart: "2026-08-01", periodEnd: "2026-08-31" })],
    { now: new Date(2026, 8, 17) }, // 2026年9月: 前月分あり → 正常
  );
  assert.equal(freshGroup.isStale, false);
  assert.equal(freshGroup.monthsSinceLatest, 1);

  const [staleGroup] = buildPosSellingStoreGroups(
    [buildEntry({ periodStart: "2026-06-01", periodEnd: "2026-06-30" })],
    { now: new Date(2026, 8, 17) }, // 最新が6月分 → 2ヶ月前で止まっている
  );
  assert.equal(staleGroup.isStale, true);
  assert.equal(staleGroup.monthsSinceLatest, 3);
});

test("販売中判定はその小売の最新POS月を起点にする（未アップロード月に引きずられない）", () => {
  // 最新POSが6月分で止まっていても、6月基準の直近3ヶ月(4〜6月)で判定する
  const [group] = buildPosSellingStoreGroups(
    [
      buildEntry({
        id: "a",
        storeName: "天神店",
        matchedStoreName: "天神店",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
      }),
      buildEntry({
        id: "b",
        storeName: "久留米店",
        matchedStoreName: "久留米店",
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
      }),
    ],
    { now: new Date(2026, 8, 17) },
  );

  assert.equal(group.latestMonthKey, "2026-06");
  assert.equal(group.activeStoreCount, 2);
  assert.equal(group.isStale, true);
});

test("小売企業ごとにグループ化し、年またぎの月差も正しく計算する", () => {
  const groups = buildPosSellingStoreGroups(
    [
      buildEntry({ id: "a", retailer: "ロフト", storeName: "銀座ロフト", matchedStoreName: "銀座ロフト" }),
      buildEntry({ id: "b", retailer: "インキューブ" }),
    ],
    { now: new Date(2026, 8, 17) },
  );

  assert.deepEqual(
    groups.map((group) => group.retailer),
    ["インキューブ", "ロフト"],
  );

  assert.equal(diffMonthKeys("2025-11", "2026-02"), 3);
  assert.equal(diffMonthKeys("2026-02", "2025-11"), -3);
  assert.equal(formatMonthKeyLabel("2026-08"), "2026年8月");
});
