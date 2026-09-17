import {
  getSelloutDisplayStoreName,
  getSelloutMonthKey,
  getSelloutStoreKey,
} from "@/lib/sellout-view";
import type { SelloutEntry } from "@/lib/types";

/** 直近何ヶ月に販売実績があれば「販売中」とみなすか */
export const POS_SELLING_ACTIVE_MONTHS = 3;

export type PosSellingStore = {
  storeKey: string;
  storeName: string;
  /** YYYY-MM。販売実績（数量か金額が正）のあった最後の月 */
  lastSoldMonthKey: string;
  /** 販売中判定ウィンドウ内の販売数量合計 */
  recentQty: number;
  isActive: boolean;
};

export type PosSellingStoreGroup = {
  retailer: string;
  /** この小売で取り込み済みのPOSの最新月（YYYY-MM） */
  latestMonthKey: string;
  /** 今月から最新POS月まで何ヶ月離れているか（同月なら0） */
  monthsSinceLatest: number;
  /** 前月分すら無い＝2ヶ月以上更新が止まっている場合に警告を出す */
  isStale: boolean;
  activeStoreCount: number;
  inactiveStoreCount: number;
  stores: PosSellingStore[];
};

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

export function getCurrentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthKeyLabel(monthKey: string) {
  if (!MONTH_KEY_PATTERN.test(monthKey)) {
    return monthKey || "不明";
  }

  return `${monthKey.slice(0, 4)}年${Number(monthKey.slice(5))}月`;
}

/** from → to が何ヶ月先か（to が過去ならマイナス） */
export function diffMonthKeys(from: string, to: string) {
  const fromYear = Number(from.slice(0, 4));
  const fromMonth = Number(from.slice(5));
  const toYear = Number(to.slice(0, 4));
  const toMonth = Number(to.slice(5));

  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export function buildPosSellingStoreGroups(
  entries: SelloutEntry[],
  options?: { now?: Date; activeMonths?: number },
): PosSellingStoreGroup[] {
  const now = options?.now ?? new Date();
  const activeMonths = options?.activeMonths ?? POS_SELLING_ACTIVE_MONTHS;
  const currentMonthKey = getCurrentMonthKey(now);

  type StoreAccumulator = {
    storeKey: string;
    storeName: string;
    qtyByMonth: Map<string, number>;
    lastSoldMonthKey: string;
  };

  const storesByRetailer = new Map<string, Map<string, StoreAccumulator>>();

  for (const entry of entries) {
    // 実売の判定なので、在庫のみの行や販売0の行は対象外にする
    if (entry.qty <= 0 && entry.amount <= 0) {
      continue;
    }

    const monthKey = getSelloutMonthKey(entry);
    if (!MONTH_KEY_PATTERN.test(monthKey)) {
      continue;
    }

    const retailer = entry.retailer.trim() || "その他";
    const storeKey = getSelloutStoreKey(entry);
    if (!storeKey) {
      continue;
    }

    let retailerStores = storesByRetailer.get(retailer);
    if (!retailerStores) {
      retailerStores = new Map();
      storesByRetailer.set(retailer, retailerStores);
    }

    let store = retailerStores.get(storeKey);
    if (!store) {
      store = {
        storeKey,
        storeName: getSelloutDisplayStoreName(entry),
        qtyByMonth: new Map(),
        lastSoldMonthKey: monthKey,
      };
      retailerStores.set(storeKey, store);
    }

    store.qtyByMonth.set(monthKey, (store.qtyByMonth.get(monthKey) ?? 0) + entry.qty);
    if (monthKey > store.lastSoldMonthKey) {
      store.lastSoldMonthKey = monthKey;
    }
    // 「店舗不明」よりマシな表示名が後から来たら差し替える
    const displayName = getSelloutDisplayStoreName(entry);
    if (store.storeName === "店舗不明" && displayName !== "店舗不明") {
      store.storeName = displayName;
    }
  }

  const groups: PosSellingStoreGroup[] = [];

  for (const [retailer, retailerStores] of storesByRetailer) {
    let latestMonthKey = "";
    for (const store of retailerStores.values()) {
      if (store.lastSoldMonthKey > latestMonthKey) {
        latestMonthKey = store.lastSoldMonthKey;
      }
    }

    const stores: PosSellingStore[] = [...retailerStores.values()].map((store) => {
      // 販売中判定は「その小売の最新POS月」を起点にする。
      // 当月POSが未取込でも、取込済みの最新月を基準に直近activeMonthsヶ月を見る。
      const isActive = diffMonthKeys(store.lastSoldMonthKey, latestMonthKey) < activeMonths;
      let recentQty = 0;
      for (const [monthKey, qty] of store.qtyByMonth) {
        if (diffMonthKeys(monthKey, latestMonthKey) < activeMonths) {
          recentQty += qty;
        }
      }

      return {
        storeKey: store.storeKey,
        storeName: store.storeName,
        lastSoldMonthKey: store.lastSoldMonthKey,
        recentQty,
        isActive,
      };
    });

    stores.sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1;
      }
      if (left.recentQty !== right.recentQty) {
        return right.recentQty - left.recentQty;
      }
      return left.storeName.localeCompare(right.storeName, "ja");
    });

    const monthsSinceLatest = Math.max(diffMonthKeys(latestMonthKey, currentMonthKey), 0);

    groups.push({
      retailer,
      latestMonthKey,
      monthsSinceLatest,
      isStale: monthsSinceLatest >= 2,
      activeStoreCount: stores.filter((store) => store.isActive).length,
      inactiveStoreCount: stores.filter((store) => !store.isActive).length,
      stores,
    });
  }

  return groups.sort((left, right) => left.retailer.localeCompare(right.retailer, "ja"));
}
