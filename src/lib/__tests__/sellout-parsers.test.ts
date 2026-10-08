import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  normalizeSelloutProductNameKey,
  parseSelloutWorkbook,
  resolvePivotMonthPeriod,
} from "@/lib/sellout-parsers";

function buildWorkbook(sheets: Record<string, (string | number | Date)[][]>) {
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

test("店舗CDヘッダーが空欄のロフト新形式も取り込む", () => {
  const parsed = parseSelloutWorkbook(
    buildWorkbook({
      Sheet1: [
        ["", "", "店舗", "JAN", "商品", "カテゴリ", "クラス", "売上", "金額", "在庫", "終了フラグ", "設定日", "担当", "所属"],
        [20260930, "201", "池袋ロフト", 4573587783667, "エシエンスＣＡＺダーマインショット１００", 12, 1266, 8, 19840, 5, 1, 20260907, "担当A", "本社"],
        [20260930, "9999", "全店", 4573587783667, "エシエンスＣＡＺダーマインショット１００", 12, 1266, 83, 205840, 49, 1, 20260913, "", ""],
      ],
    }),
  );

  assert.equal(parsed.profileKey, "loft-monthly-sellout");
  assert.equal(parsed.retailer, "ロフト");
  assert.equal(parsed.periodStart, "2026-09-30");
  // 全店（集計行）は店舗CDヘッダーが無くても店名ラベルで飛ばす
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].storeName, "池袋ロフト");
  assert.equal(parsed.entries[0].qty, 8);
  assert.equal(parsed.entries[0].amount, 19840);
  assert.equal(parsed.entries[0].stock, 5);
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

test("アットコスメの月次一覧を取り込む", () => {
  const parsed = parseSelloutWorkbook(
    buildWorkbook({
      Sheet1: [
        ["売上日付", "店舗CD", "店舗名称", "メーカー名", "ＪＡＮ", "品名", "登録単価", "売上数", "売上金額"],
        ["2026-08", "67", "アミュエスト博多店", "ESIENCE", "4573587783667", "ダーマインショット", 2480, 1, 2480],
        ["2026-08", "501", "@COSME TOKYO", "ESIENCE", "4573587783667", "ダーマインショット", 2480, 6, 14880],
        ["2026-08", "600", "天満橋京阪シティモール店", "ESIENCE", "4573587783667", "ダーマインショット", 2480, 5, 12400],
      ],
    }),
  );

  assert.equal(parsed.profileKey, "atcosme-monthly-sellout");
  assert.equal(parsed.retailer, "@cosme STORE");
  assert.equal(parsed.periodStart, "2026-08-01");
  assert.equal(parsed.periodEnd, "2026-08-31");
  assert.equal(parsed.entries.length, 3);
  assert.equal(parsed.entries[1].storeName, "@COSME TOKYO");
  assert.equal(parsed.entries[1].qty, 6);
  assert.equal(parsed.entries[1].amount, 14880);
});

test("インキューブの日別POS（売上データ照会）を取り込む", () => {
  const parsed = parseSelloutWorkbook(
    buildWorkbook({
      // 1枚目はピボット集計シート。2枚目の明細シートを読むこと。
      Sheet1: [
        ["行ラベル", "合計 / 売上数量", "合計 / 売上金額"],
        ["天神店", 3, 7440],
      ],
      売上データ照会_20260910113639: [
        ["日別日付", "店舗名", "JANコード", "商品名", "売上金額", "売上数量"],
        [new Date(2026, 7, 1), "天神店　　", 4573587783667, "エシエンスＣＡＺダーマＳ", 2480, 1],
        [new Date(2026, 7, 15), "久留米店", 4573587783667, "エシエンスＣＡＺダーマＳ", 4960, 2],
      ],
    }),
  );

  assert.equal(parsed.profileKey, "incube-daily-sellout");
  assert.equal(parsed.retailer, "インキューブ");
  assert.equal(parsed.periodStart, "2026-08-01");
  assert.equal(parsed.periodEnd, "2026-08-15");
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].storeName, "天神店");
  assert.equal(parsed.entries[0].jan, "4573587783667");
  assert.equal(parsed.entries[0].qty, 1);
  assert.equal(parsed.entries[0].amount, 2480);
  assert.equal(parsed.entries[1].periodStart, "2026-08-15");
});

test("店名に@cosmeを含まないアットコスメPOSも形式で判別する", () => {
  const parsed = parseSelloutWorkbook(
    buildWorkbook({
      Sheet1: [
        ["売上日付", "店舗CD", "店舗名称", "小分類ＣＤ", "小分類名", "メーカーＣＤ", "メーカー名", "ＪＡＮ", "メーカー品番", "品名", "登録単価", "売上数", "売上金額"],
        ["2026-09", 600, "天満橋京阪シティモール店", 20201, "美容液", 41494, "ESIENCE", "4573587783667", "4573587783667", "C×AZ ﾀﾞｰﾏｲﾝｼｮｯﾄ  14包", 2480, 6, 14880],
      ],
    }),
  );

  assert.equal(parsed.profileKey, "atcosme-monthly-sellout");
  assert.equal(parsed.retailer, "@cosme STORE");
  assert.equal(parsed.periodStart, "2026-09-01");
  assert.equal(parsed.periodEnd, "2026-09-30");
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].storeName, "天満橋京阪シティモール店");
  assert.equal(parsed.entries[0].jan, "4573587783667");
  assert.equal(parsed.entries[0].qty, 6);
  assert.equal(parsed.entries[0].amount, 14880);
});

test("インキューブのピボット形式（店舗×商品の入れ子）を取り込む", () => {
  const parsed = parseSelloutWorkbook(
    buildWorkbook({
      "2026年9月": [
        ["行ラベル", "合計 / 売上数量", "合計 / 売上金額"],
        ["天神店　　", 3, 7440],
        ["エシエンスＣＡＺダーマＳ    ", 3, 7440],
        // 2商品ある店舗: 店舗行は商品行の合計
        ["久留米店", 5, 12280],
        ["エシエンスＣＡＺダーマＳ    ", 4, 9920],
        ["エシエンスミスト", 1, 2360],
        ["(空白)", "", ""],
        ["総計", 8, 19720],
      ],
    }),
  );

  assert.equal(parsed.profileKey, "incube-pivot-sellout");
  assert.equal(parsed.retailer, "インキューブ");
  assert.equal(parsed.periodStart, "2026-09-01");
  assert.equal(parsed.periodEnd, "2026-09-30");
  // 店舗行・総計・(空白)は明細にしない。商品行だけが明細になる
  assert.equal(parsed.entries.length, 3);
  assert.deepEqual(
    parsed.entries.map((entry) => [entry.storeName, entry.productName, entry.qty, entry.amount]),
    [
      ["天神店", "エシエンスＣＡＺダーマＳ", 3, 7440],
      ["久留米店", "エシエンスＣＡＺダーマＳ", 4, 9920],
      ["久留米店", "エシエンスミスト", 1, 2360],
    ],
  );
  // JANはファイルに無いので空のまま（取込時に商品名から補完する）
  assert.equal(parsed.entries[0].jan, "");
});

test("店舗だけのフラットなピボットは店舗単位で取り込む", () => {
  const parsed = parseSelloutWorkbook(
    buildWorkbook({
      "9月": [
        ["行ラベル", "合計 / 売上数量", "合計 / 売上金額"],
        ["天神店", 3, 7440],
        ["久留米店", 5, 12400],
        ["草津店", 2, 4960],
        ["総計", 10, 24800],
      ],
    }),
  );

  assert.equal(parsed.profileKey, "incube-pivot-sellout");
  assert.equal(parsed.entries.length, 3);
  assert.equal(parsed.entries[0].productName, "");
  assert.equal(parsed.entries[0].qty, 3);
});

test("ピボットのシート名から対象月を解決する（年なしは直近の該当月）", () => {
  const now = new Date(2026, 9, 8); // 2026年10月
  assert.deepEqual(resolvePivotMonthPeriod("9月", now), {
    start: "2026-09-01",
    end: "2026-09-30",
  });
  // 年なしで未来の月なら前年とみなす
  assert.deepEqual(resolvePivotMonthPeriod("12月", now), {
    start: "2025-12-01",
    end: "2025-12-31",
  });
  assert.deepEqual(resolvePivotMonthPeriod("2026年9月", now), {
    start: "2026-09-01",
    end: "2026-09-30",
  });
  assert.equal(resolvePivotMonthPeriod("実績", now), null);

  assert.equal(
    normalizeSelloutProductNameKey("エシエンスＣＡＺダーマＳ    "),
    normalizeSelloutProductNameKey("エシエンスCAZダーマS"),
  );
});

test("判別できないファイルは取込エラーにする", () => {
  assert.throws(
    () => parseSelloutWorkbook(buildWorkbook({ Sheet1: [["foo", "bar"], ["1", "2"]] })),
    /セルアウトファイルの形式を判別できませんでした/,
  );
});
