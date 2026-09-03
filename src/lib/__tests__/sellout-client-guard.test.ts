import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateSelloutClientGuard } from "@/lib/sellout-client-guard";

const catalog = [
  { jan: "4573587783667", clientId: "esience", clientName: "エシエンス" },
  { jan: "4900000000001", clientId: "wellne", clientName: "はぐくみプラス" },
];

test("今のクライアントのJANだけなら取り込む", () => {
  const result = evaluateSelloutClientGuard({
    selectedClientId: "wellne",
    selectedClientName: "はぐくみプラス",
    jans: ["4900000000001"],
    catalog,
  });
  assert.equal(result.ok, true);
});

test("別クライアントのJANなら止める", () => {
  const result = evaluateSelloutClientGuard({
    selectedClientId: "wellne",
    selectedClientName: "はぐくみプラス",
    jans: ["4573587783667"],
    catalog,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /エシエンス/);
  }
});

test("マスタにないJANなら止める", () => {
  const result = evaluateSelloutClientGuard({
    selectedClientId: "wellne",
    selectedClientName: "はぐくみプラス",
    jans: ["9999999999999"],
    catalog,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /9999999999999/);
  }
});

test("JANが無いファイルは止める", () => {
  const result = evaluateSelloutClientGuard({
    selectedClientId: "wellne",
    selectedClientName: "はぐくみプラス",
    jans: ["", "  "],
    catalog,
  });
  assert.equal(result.ok, false);
});
