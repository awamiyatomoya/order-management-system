import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { parseSelloutWorkbook } from "@/lib/sellout-parsers";

function buildWorkbook(sheets: Record<string, (string | number)[][]>) {
  const workbook = XLSX.utils.book_new();

  Object.entries(sheets).forEach(([sheetName, rows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  });

  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

test("ロフトの月次一覧を取り込む", () => {
  const parsed = parseSelloutWorkbook(
    buildWorkbook({
      Sheet1: [
        ["", "店舗CD", "店舗", "JAN", "商品", "売上", "金額", "在庫"],
        ["20260831", "235", "銀座ロフト", "4573587783667", "ダーマインショット", 10, 24800, 6],
        ["20260831", "9999", "全店", "4573587783667", "ダーマインショット", 10, 24800, 6],
      ],
    }),
  );

  assert.equal(parsed.profileKey, "loft-monthly-sellout");
  assert.equal(parsed.retailer, "ロフト");
  // 店舗CD 9999（全店）は集計行なので取り込まない
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].storeName, "銀座ロフト");
  assert.equal(parsed.entries[0].qty, 10);
});

test("ドン・キホーテの店舗軸クロス表を取り込む", () => {
  const parsed = parseSelloutWorkbook(
    buildWorkbook({
      店舗軸: [
        ["mbrdp/dp_002"],
        ["任意単品分析(クロス表)　　　mbrdp/dp_002"],
        ["・期間：20260715～20260815　　・法人：ドンキ(00001)"],
        ["店舗コード", "店舗名", "合計", "", "REVITAL　GOLD　15日分（4573587782929）", ""],
        ["", "", "売上数量", "売上金額", "売上数量", "売上金額"],
        ["合計", "", 62, 120485, 62, 120485],
        ["00092", "ドン・キホーテ 銀座本館", 56, 108605, 56, 108605],
        ["00122", "ドン・キホーテ 横浜西口店", 6, 11880, 6, 11880],
        ["00999", "ドン・キホーテ 売上なし店", 0, 0, 0, 0],
      ],
    }),
  );

  assert.equal(parsed.profileKey, "donki-store-axis");
  assert.equal(parsed.retailer, "ドン・キホーテ");
  assert.equal(parsed.periodStart, "2026-07-15");
  assert.equal(parsed.periodEnd, "2026-08-15");
  // 合計行と売上0の店は除く
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].jan, "4573587782929");
  assert.equal(parsed.entries[0].qty, 56);
});

test("未知フォーマットでも店舗×商品のクロス表なら読み取る", () => {
  const parsed = parseSelloutWorkbook(
    buildWorkbook({
      売上: [
        ["集計期間：2026年01月01日～2026年01月31日"],
        ["店舗コード", "店舗名", "テスト商品（4901234567890）", ""],
        ["", "", "売上数量", "売上金額"],
        ["1", "ロフト 渋谷", 3, 3000],
      ],
    }),
  );

  assert.equal(parsed.profileKey, "heuristic-store-product");
  assert.equal(parsed.retailer, "ロフト");
  assert.equal(parsed.entries.length, 1);
});

test("判別できないファイルは取込エラーにする", () => {
  assert.throws(
    () => parseSelloutWorkbook(buildWorkbook({ Sheet1: [["foo", "bar"], ["1", "2"]] })),
    /セルアウトファイルの形式を判別できませんでした/,
  );
});
