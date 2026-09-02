import assert from "node:assert/strict";
import { test } from "node:test";
import loftStoreMaster from "./fixtures/loft-store-master.json" with { type: "json" };
import {
  findDuplicateSelloutImport,
  resolveImportedSelloutStore,
} from "@/lib/sellout-store-match";
import { buildStoreLocationLookup, type StoreLocation } from "@/lib/store-location-matching";

const loftLookup = buildStoreLocationLookup(loftStoreMaster as StoreLocation[]);

test("ドンキの店をロフト店舗マスタに寄せない", () => {
  const matched = resolveImportedSelloutStore(
    { storeCode: "00617", storeName: "ドン・キホーテ 高田馬場駅前店" },
    "ドン・キホーテ",
    loftLookup,
  );

  assert.equal(matched.matchedStoreName, "ドン・キホーテ 高田馬場駅前店");
  assert.equal(matched.matchedStoreCode, "00617");
});

test("同じ小売企業の同じ期間は二重取込とみなす", () => {
  const existing = [
    {
      retailer: "ドン・キホーテ",
      periodStart: "2026-07-15",
      periodEnd: "2026-08-15",
    },
  ];

  const duplicate = findDuplicateSelloutImport(existing, {
    retailer: "ドン・キホーテ",
    periodStart: "2026-07-15",
    periodEnd: "2026-08-15",
  });
  const otherMonth = findDuplicateSelloutImport(existing, {
    retailer: "ドン・キホーテ",
    periodStart: "2026-08-16",
    periodEnd: "2026-09-15",
  });

  assert.equal(duplicate, existing[0]);
  assert.equal(otherMonth, undefined);
});
