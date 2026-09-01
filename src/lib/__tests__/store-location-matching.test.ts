import assert from "node:assert/strict";
import { test } from "node:test";
import loftStoreMaster from "./fixtures/loft-store-master.json" with { type: "json" };
import {
  buildStoreLocationLookup,
  resolveStoreLocationMatch,
  type StoreLocation,
} from "@/lib/store-location-matching";

const loftLookup = buildStoreLocationLookup(loftStoreMaster as StoreLocation[]);

function matchLoft(storeCode: string, storeName: string) {
  return resolveStoreLocationMatch(
    { storeCode, storeName, postalCode: "", address: "" },
    loftLookup,
  )?.storeName;
}

/**
 * 2026-07 と 2026-08 のロフトPOSで、9/18店が別の店に化けた実データ。
 * ExcelのPOS店舗CDと公式サイトの shop_id が別体系なのに、CDで照合していたのが原因。
 */
const loftPosRows = [
  { storeCode: "201", storeName: "池袋ロフト", expected: "池袋ロフト" },
  { storeCode: "202", storeName: "渋谷ロフト", expected: "渋谷ロフト" },
  { storeCode: "207", storeName: "吉祥寺ロフト", expected: "吉祥寺ロフト" },
  { storeCode: "215", storeName: "仙台ロフト", expected: "仙台ロフト" },
  { storeCode: "218", storeName: "千葉ロフト", expected: "千葉ロフト" },
  { storeCode: "219", storeName: "新潟ロフト", expected: "新潟ロフト" },
  { storeCode: "223", storeName: "西宮ロフト", expected: "西宮ロフト" },
  { storeCode: "225", storeName: "京都ロフト", expected: "京都ロフト" },
  { storeCode: "226", storeName: "二子玉川ロフト", expected: "二子玉川ロフト" },
  { storeCode: "229", storeName: "大宮ロフト", expected: "大宮ロフト" },
  { storeCode: "231", storeName: "千里万博ロフト", expected: "千里バンパクロフト" },
  { storeCode: "233", storeName: "町田ロフト", expected: "町田ロフト" },
  { storeCode: "234", storeName: "新川崎ロフト", expected: "川崎ロフト" },
  { storeCode: "235", storeName: "銀座ロフト", expected: "銀座ロフト" },
  { storeCode: "236", storeName: "新天神ロフト", expected: "天神ロフト" },
  { storeCode: "368", storeName: "新神戸ロフト", expected: "神戸ロフト" },
  { storeCode: "836", storeName: "髙松ロフト", expected: "高松ロフト" },
  { storeCode: "864", storeName: "新岡山ロフト", expected: "岡山ロフト" },
];

test("ロフトPOSの全店がマスタの正しい店舗に解決する", () => {
  const wrong = loftPosRows
    .map((row) => ({ ...row, actual: matchLoft(row.storeCode, row.storeName) }))
    .filter((row) => row.actual !== row.expected);

  assert.deepEqual(
    wrong.map((row) => `${row.storeName}(CD:${row.storeCode}) -> ${row.actual ?? "未照合"}`),
    [],
  );
});

test("POSの店舗CDを公式サイトの shop_id として使わない", () => {
  // loft-235 は公式サイトでは新横浜ロフト。CD照合を復活させるとここで落ちる。
  assert.equal(matchLoft("235", "銀座ロフト"), "銀座ロフト");
  assert.equal(matchLoft("201", "池袋ロフト"), "池袋ロフト");
  assert.equal(matchLoft("229", "大宮ロフト"), "大宮ロフト");

  // 店名がなければ、CDだけで公式店舗に結びつけてはいけない
  assert.equal(matchLoft("235", ""), undefined);
});

test("異体字の店名がマスタに一致する", () => {
  assert.equal(matchLoft("", "髙松ロフト"), "高松ロフト");
});

/**
 * 「新横浜ロフト」問題の本質は、照合できない店名を曖昧一致で近い店に寄せていたこと。
 * マスタにない店名は、別のロフト店に化けるより未照合のままにする。
 */
test("マスタにないロフト店名を別のロフト店に寄せない", () => {
  const unknownLoftStores = [
    "越谷ロフト",
    "藤沢ロフト",
    "銀座ロフト別館",
    "池袋ロフト2号店",
    "渋谷ロフトアネックス",
  ];

  const guessed = unknownLoftStores
    .map((storeName) => ({ storeName, actual: matchLoft("", storeName) }))
    .filter((row) => row.actual !== undefined);

  assert.deepEqual(
    guessed.map((row) => `${row.storeName} -> ${row.actual}`),
    [],
  );
});

test("他チェーンの店名をロフト店舗に誤照合しない", () => {
  const otherChainStores = [
    "ドン・キホーテ 銀座本館",
    "ドン・キホーテ 横浜西口店",
    "MEGAドンキ渋谷別館",
    "ピカソ 赤坂店",
    "長崎屋 小樽店",
    "情熱職人 川越店",
    "ハンズ 渋谷店",
  ];

  const mismatched = otherChainStores
    .map((storeName) => ({ storeName, actual: matchLoft("", storeName) }))
    .filter((row) => row.actual !== undefined);

  assert.deepEqual(
    mismatched.map((row) => `${row.storeName} -> ${row.actual}`),
    [],
  );
});
