import type { Order, Store, StoreIntroductionFormatKey } from "@/lib/types";

export const defaultStoreChains: Store[] = [
  {
    id: "default-store-ainz",
    name: "アインズ",
    aliases: ["アインズ", "アインズ&トルペ", "アインズアンドトルペ", "AINZ", "AINZ&TULPE"],
  },
  {
    id: "default-store-hands",
    name: "ハンズ",
    aliases: ["ハンズ", "東急ハンズ", "HANDS", "TOKYU HANDS"],
  },
  {
    id: "default-store-loft",
    name: "ロフト",
    aliases: ["ロフト", "LOFT", "ロフトホング", "*ロフトホング"],
  },
  {
    id: "default-store-mimosa",
    name: "ミモザ",
    aliases: ["ミモザ", "イナイミモザ", "*イナイミモザ", "*イナイミモザ 78"],
  },
  {
    id: "default-store-other",
    name: "その他",
    aliases: ["その他", "在庫分", "ザイコブン", "ザ イコブン", "*ザ イコブン"],
  },
];

export function applyStoreNamesToOrders(orders: Order[], stores: Store[]) {
  return orders.map((order) => {
    const storeName = resolveStoreNameForOrder(order, stores);
    const reviewReasons = Array.from(new Set(order.reviewReasons ?? []));

    if (storeName === "店舗不明") {
      reviewReasons.push("店舗マスタ未登録");
    }

    return {
      ...order,
      storeName,
      needsReview: order.needsReview || reviewReasons.length > 0,
      reviewReasons,
    };
  });
}

export function resolveStoreNameForOrder(order: Order, stores: Store[]) {
  const memo =
    order.lines
      .map((line) => line.memo)
      .find((value) => normalizeStoreName(value) && !isLikelyTableHeaderMemo(value)) ?? "";

  return getStoreNameFromMemo(memo, stores);
}

export function getOrderStoreName(order: Order, stores: Store[]) {
  if (order.storeName && !isLikelyTableHeaderMemo(order.storeName)) {
    return order.storeName;
  }

  return resolveStoreNameForOrder(order, stores);
}

export function getStoreNameFromMemo(memo: string, stores: Store[]) {
  const memoStoreName = normalizeStoreName(memo);

  if (!memoStoreName || isLikelyTableHeaderMemo(memoStoreName)) {
    return "店舗不明";
  }

  const defaultStoreName = getDefaultStoreNameFromMemo(memoStoreName);
  if (defaultStoreName) {
    return defaultStoreName;
  }

  const matchingStores = mergeStoreChains(defaultStoreChains, stores);
  const matchedStore = matchingStores
    .map((store) => ({
      store,
      score: getStoreMatchScore(memoStoreName, store),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.store;

  return matchedStore?.name ?? "店舗不明";
}

export function isLoftSeriesIntroductionSheet(
  formatKey: StoreIntroductionFormatKey,
  entries: { storeName: string; storeCode: string }[],
) {
  if (formatKey !== "flag-list" || entries.length < 5) {
    return false;
  }

  const loftNameMatches = entries.filter((entry) => {
    const normalized = normalizeStoreMatchText(entry.storeName);
    return normalized.includes("ロフト") || normalized.includes("loft");
  }).length;

  if (loftNameMatches >= 3) {
    return true;
  }

  const loftCodeMatches = entries.filter((entry) => isLoftSeriesStoreCode(entry.storeCode)).length;

  return loftCodeMatches >= Math.min(10, Math.ceil(entries.length * 0.2));
}

export function getMatchedStoreNameForIntroduction(
  entry: { storeName: string; storeCode: string },
  formatKey: StoreIntroductionFormatKey,
  stores: Store[],
  isLoftSeriesSheet: boolean,
) {
  if (formatKey === "flag-list" && isLoftSeriesSheet) {
    return "ロフト";
  }

  if (formatKey === "flag-list" && isLoftSeriesStoreCode(entry.storeCode)) {
    return "ロフト";
  }

  return getStoreNameFromMemo(entry.storeName, stores);
}

function isLoftSeriesStoreCode(storeCode: string) {
  const normalized = storeCode.trim();
  return /^2\d{2}$/.test(normalized) || normalized === "501";
}

export function extractUnknownStoreCandidates(orders: Order[], stores: Store[]) {
  const candidates = orders.flatMap((order) =>
    order.lines
      .map((line) => normalizeStoreName(line.memo))
      .filter((candidate) => candidate && !isLikelyTableHeaderMemo(candidate))
      .filter((candidate) => isUnknownStoreCandidate(candidate, stores)),
  );

  return Array.from(new Set(candidates));
}

function isUnknownStoreCandidate(candidate: string, stores: Store[]) {
  if (!candidate) {
    return false;
  }

  if (getDefaultStoreNameFromMemo(candidate)) {
    return false;
  }

  const matchingStores = mergeStoreChains(defaultStoreChains, stores);
  return matchingStores.every((store) => getStoreMatchScore(candidate, store) === 0);
}

function getDefaultStoreNameFromMemo(memoStoreName: string) {
  const memo = normalizeStoreMatchText(memoStoreName);

  if (memo.includes("ロフト") || memo.includes("loft")) {
    return "ロフト";
  }

  if (memo.includes("ハンズ") || memo.includes("tokyuhands") || memo.includes("hands")) {
    return "ハンズ";
  }

  if (memo.includes("アインズ") || memo.includes("ainz")) {
    return "アインズ";
  }

  if (memo.includes("イナイミモザ") || memo.includes("ミモザ")) {
    return "ミモザ";
  }

  return null;
}

export function mergeStoreChains(defaultStores: Store[], stores: Store[]) {
  const mergedStores: Store[] = [];

  defaultStores.forEach((store) => {
    mergedStores.push({
      ...store,
      aliases: Array.from(new Set([...store.aliases, store.name])),
    });
  });

  stores.forEach((store) => {
    const existingIndex = mergedStores.findIndex((candidate) => storesRepresentSameChain(candidate, store));

    if (existingIndex === -1) {
      mergedStores.push({
        ...store,
        aliases: Array.from(new Set([...store.aliases, store.name])),
      });
      return;
    }

    const existing = mergedStores[existingIndex];
    mergedStores[existingIndex] = {
      ...existing,
      aliases: Array.from(new Set([...existing.aliases, existing.name, store.name, ...store.aliases])),
    };
  });

  return mergedStores;
}

function storesRepresentSameChain(a: Store, b: Store) {
  const aCandidates = [a.name, ...a.aliases].map(normalizeStoreMatchText).filter(Boolean);
  const bCandidates = [b.name, ...b.aliases].map(normalizeStoreMatchText).filter(Boolean);

  return aCandidates.some((aCandidate) => bCandidates.some((bCandidate) => aCandidate === bCandidate));
}

function isLikelyTableHeaderMemo(value: string) {
  const text = value.replace(/\s/g, "");
  const headerTokens = ["発注番号", "発注日", "着荷指定", "口座", "商品コード", "条件区分", "有償", "景品"];
  const hitCount = headerTokens.filter((token) => text.includes(token)).length;

  return hitCount >= 2;
}

function normalizeStoreName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/^入荷先[:：]?/, "")
    .replace(/^店舗[:：]?/, "")
    .replace(/^店名[:：]?/, "")
    .replace(/^\*+/, "")
    .replace(/\s*¥[\d,]+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStoreMatchText(value: string) {
  return normalizeStoreName(value)
    .toLowerCase()
    .replace(/[\s　・･\\/／\-ー‐‑‒–—―_,，、.．()（）［\]\[【】]/g, "");
}

function getStoreMatchScore(memoStoreName: string, store: Store) {
  const memo = normalizeStoreMatchText(memoStoreName);
  const candidates = [store.name, ...store.aliases]
    .map((alias) => normalizeStoreMatchText(alias))
    .filter(Boolean);

  return candidates.reduce((score, candidate) => {
    if (memo === candidate) {
      return Math.max(score, candidate.length + 1000);
    }

    if (memo.includes(candidate) || candidate.includes(memo)) {
      return Math.max(score, candidate.length);
    }

    return score;
  }, 0);
}
