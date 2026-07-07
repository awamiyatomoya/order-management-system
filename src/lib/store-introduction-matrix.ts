import type { StoreLocationRecord } from "@/lib/store-location-groups";
import { inferStoreLocationChainName } from "@/lib/store-location-groups";
import {
  buildStoreLocationLookup,
  formatStoreLocationAddress,
  normalizeStoreLocationName,
  resolveStoreLocationAddress,
  resolveStoreLocationMatch,
  type StoreLocation,
} from "@/lib/store-location-matching";

export type IntroductionMatrixProduct = {
  key: string;
  jan: string;
  productName: string;
};

export type IntroductionMatrixRow = {
  rowKey: string;
  storeName: string;
  address: string;
  introducedByProduct: Record<string, boolean>;
  hasAnyIntroduction: boolean;
};

export type IntroductionMatrixEntry = {
  storeCode: string;
  storeName: string;
  address: string;
  postalCode: string;
  jan: string;
  productName: string;
  isIntroduced: boolean;
  chainName: string;
};

export function buildStoreIntroductionMatrix({
  chainFilter,
  storeLocations,
  entries,
  products,
  showIntroducedOnly,
}: {
  chainFilter: string;
  storeLocations: StoreLocationRecord[];
  entries: IntroductionMatrixEntry[];
  products: IntroductionMatrixProduct[];
  showIntroducedOnly: boolean;
}): { rows: IntroductionMatrixRow[]; products: IntroductionMatrixProduct[] } {
  const introductionLookup = buildIntroductionLookup(entries, products);
  const storeRows = buildMatrixStoreRows(chainFilter, storeLocations, entries);
  const storeLocationLookup = buildStoreLocationLookup(storeLocations);

  const rows = storeRows
    .map((store) => {
      const matchKeys = buildStoreMatchKeys(store.storeName, store.storeCode);
      const introducedByProduct = Object.fromEntries(
        products.map((product) => [
          product.key,
          isProductIntroduced(introductionLookup, matchKeys, product.key),
        ]),
      ) as Record<string, boolean>;
      const hasAnyIntroduction = Object.values(introducedByProduct).some(Boolean);
      const address =
        resolveStoreLocationAddress(store, storeLocationLookup) || formatStoreLocationAddress(store);

      return {
        rowKey: matchKeys[0] ?? store.storeName,
        storeName: store.storeName,
        address,
        introducedByProduct,
        hasAnyIntroduction,
      };
    })
    .filter((row) => !showIntroducedOnly || row.hasAnyIntroduction)
    .sort((left, right) => left.storeName.localeCompare(right.storeName, "ja"));

  return { rows, products };
}

function buildIntroductionLookup(
  entries: IntroductionMatrixEntry[],
  products: IntroductionMatrixProduct[],
) {
  const productKeys = new Set(products.map((product) => product.key));
  const lookup = new Map<string, boolean>();

  entries.forEach((entry) => {
    const productKey = `${entry.jan}::${entry.productName}`;
    if (!productKeys.has(productKey)) {
      return;
    }

    buildStoreMatchKeys(entry.storeName, entry.storeCode).forEach((storeKey) => {
      lookup.set(`${storeKey}::${productKey}`, entry.isIntroduced);
    });
  });

  return lookup;
}

function isProductIntroduced(
  lookup: Map<string, boolean>,
  storeMatchKeys: string[],
  productKey: string,
) {
  return storeMatchKeys.some((storeKey) => lookup.get(`${storeKey}::${productKey}`) === true);
}

function buildMatrixStoreRows(
  chainFilter: string,
  storeLocations: StoreLocationRecord[],
  entries: IntroductionMatrixEntry[],
) {
  const filteredEntries = entries.filter(
    (entry) => chainFilter === "all" || entry.chainName === chainFilter,
  );

  const entryStores = dedupeStoreRows(
    filteredEntries.map((entry) =>
      enrichStoreFromLocations(
        {
          storeCode: entry.storeCode,
          storeName: entry.storeName,
          postalCode: entry.postalCode,
          address: entry.address,
          tel: "",
        },
        storeLocations,
      ),
    ),
  );

  if (chainFilter !== "all" && hasCompleteStoreListFromEntries(filteredEntries)) {
    return entryStores;
  }

  if (chainFilter !== "all") {
    const chainStores = storeLocations.filter(
      (location) =>
        location.chainName === chainFilter ||
        inferStoreLocationChainName(location) === chainFilter,
    );

    if (chainStores.length > 0) {
      return dedupeStoreRows(chainStores);
    }
  }

  return entryStores;
}

function hasCompleteStoreListFromEntries(entries: IntroductionMatrixEntry[]) {
  if (entries.length < 5) {
    return false;
  }

  const uniqueStores = new Set(
    entries.map((entry) => normalizeStoreLocationName(entry.storeName)).filter(Boolean),
  );

  if (uniqueStores.size < 5) {
    return false;
  }

  const hasIntroduced = entries.some((entry) => entry.isIntroduced);
  const hasNotIntroduced = entries.some((entry) => !entry.isIntroduced);

  return hasIntroduced && hasNotIntroduced;
}

function enrichStoreFromLocations(store: StoreLocation, storeLocations: StoreLocationRecord[]) {
  const lookup = buildStoreLocationLookup(storeLocations);
  const matched = resolveStoreLocationMatch(store, lookup);

  if (!matched) {
    return store;
  }

  return {
    storeCode: store.storeCode || matched.storeCode,
    storeName: store.storeName,
    postalCode: matched.postalCode || store.postalCode,
    address: matched.address || store.address,
    tel: matched.tel || store.tel,
  };
}

function dedupeStoreRows(stores: StoreLocation[]) {
  const map = new Map<string, StoreLocation>();

  stores.forEach((store) => {
    const normalizedName = normalizeStoreLocationName(store.storeName);
    const key = normalizedName || store.storeCode || store.storeName;
    const current = map.get(key);

    if (!current || (!formatStoreLocationAddress(current) && formatStoreLocationAddress(store))) {
      map.set(key, store);
    }
  });

  return Array.from(map.values());
}

function buildStoreMatchKeys(storeName: string, storeCode: string) {
  const keys = new Set<string>();
  const normalizedName = normalizeStoreLocationName(storeName);

  if (normalizedName) {
    keys.add(normalizedName);
  }

  if (storeCode) {
    keys.add(`code:${storeCode}`);
  }

  return Array.from(keys);
}
