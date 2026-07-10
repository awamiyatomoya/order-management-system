import { resolveOyamaAtCosmeOfficialStoreCode } from "@/lib/store-allocation-matching";
import type { StoreLocationRecord } from "@/lib/store-location-groups";
import {
  belongsToStoreLocationChain,
  hasOfficialChainStoreMaster,
  inferStoreLocationChainName,
} from "@/lib/store-location-groups";
import {
  buildStoreLocationLookup,
  buildStoreNameMatchKeys,
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
  chainName: string;
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
  productKey: string;
  isIntroduced: boolean;
  chainName: string;
};

type CanonicalIntroductionStore = {
  storeCode: string;
  storeName: string;
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
  const scopedEntries =
    chainFilter === "all"
      ? entries
      : entries.filter((entry) => entry.chainName === chainFilter);
  const storeLocationLookup = buildStoreLocationLookup(storeLocations);
  const introductionLookup = buildIntroductionLookup(
    scopedEntries,
    products,
    chainFilter,
    storeLocations,
  );
  const storeRows = buildMatrixStoreRows(chainFilter, storeLocations, scopedEntries);
  const existingStoreKeys = buildExistingStoreKeys(storeRows);
  const coveredRowKeys = new Set<string>();

  const rows = storeRows
    .map((store) => {
      const chainName = resolveMatrixRowChainName(store, chainFilter);
      const chainLookup = buildChainScopedStoreLocationLookup(chainName, storeLocations);
      const matchKeys = store.storeCode
        ? [`code:${store.storeCode}`]
        : buildStoreMatchKeys(store.storeName, store.storeCode);
      const introducedByProduct = Object.fromEntries(
        products.map((product) => [
          product.key,
          isProductIntroduced(introductionLookup, matchKeys, product.key, chainName),
        ]),
      ) as Record<string, boolean>;
      const hasAnyIntroduction = products.some((product) => introducedByProduct[product.key]);
      const address =
        resolveStoreLocationAddress(store, chainLookup) ||
        resolveStoreLocationAddress(store, storeLocationLookup) ||
        formatStoreLocationAddress(store);

      const rowKey = store.storeCode || matchKeys[0] || store.storeName;
      if (hasAnyIntroduction) {
        coveredRowKeys.add(rowKey);
      }

      return {
        rowKey,
        chainName,
        storeName: store.storeName,
        address,
        introducedByProduct,
        hasAnyIntroduction,
      };
    })
    .concat(
      buildSupplementalIntroducedRows({
        entries: scopedEntries,
        products,
        storeLocations,
        introductionLookup,
        coveredRowKeys,
        existingStoreKeys,
        chainFilter,
      }),
    )
    .filter((row) => chainFilter === "all" || row.chainName === chainFilter)
    .filter((row) => !showIntroducedOnly || row.hasAnyIntroduction)
    .sort(compareIntroductionMatrixRows);

  return { rows: dedupeMatrixRows(rows), products };
}

/** 小売企業名の50音順 → 同一企業内は店舗名の50音順 */
export function compareIntroductionMatrixRows(
  left: Pick<IntroductionMatrixRow, "chainName" | "storeName">,
  right: Pick<IntroductionMatrixRow, "chainName" | "storeName">,
) {
  const chainCompare = left.chainName.localeCompare(right.chainName, "ja");
  if (chainCompare !== 0) {
    return chainCompare;
  }

  return left.storeName.localeCompare(right.storeName, "ja");
}

function buildChainScopedStoreLocationLookup(
  chainName: string,
  storeLocations: StoreLocationRecord[],
) {
  const chainStores = storeLocations.filter((location) =>
    belongsToStoreLocationChain(location, chainName),
  );

  return buildStoreLocationLookup(chainStores);
}

function resolveMatrixRowChainName(
  store: MatrixStoreRow,
  chainFilter: string,
) {
  const inferred = inferStoreLocationChainName(store);
  if (inferred) {
    return inferred;
  }

  if (store.chainName?.trim()) {
    return store.chainName.trim();
  }

  return chainFilter === "all" ? "" : chainFilter;
}

function buildIntroductionLookup(
  entries: IntroductionMatrixEntry[],
  products: IntroductionMatrixProduct[],
  chainFilter: string,
  storeLocations: StoreLocationRecord[],
) {
  const productKeys = new Set(products.map((product) => product.key));
  const lookup = new Map<string, boolean>();

  entries.forEach((entry) => {
    const productKey = entry.productKey;
    if (!productKeys.has(productKey)) {
      return;
    }

    if (chainFilter !== "all" && entry.chainName !== chainFilter) {
      return;
    }

    const chainLookup = buildChainScopedStoreLocationLookup(entry.chainName, storeLocations);
    const matchedLocation = resolveStoreLocationMatch(entry, chainLookup);
    const canonical = matchedLocation
      ? {
          storeCode: matchedLocation.storeCode,
          storeName: matchedLocation.storeName,
          chainName: entry.chainName,
        }
      : {
          storeCode:
            entry.storeCode || `import:${normalizeStoreLocationName(entry.storeName) || entry.storeName}`,
          storeName: entry.storeName,
          chainName: entry.chainName,
        };

    const storeKeys = new Set<string>();
    const oyamaOfficialCode = resolveOyamaAtCosmeOfficialStoreCode(entry.storeCode);
    if (oyamaOfficialCode) {
      storeKeys.add(`code:${oyamaOfficialCode}`);
    }

    if (matchedLocation?.storeCode) {
      storeKeys.add(`code:${matchedLocation.storeCode}`);
    } else {
      buildStoreMatchKeys(canonical.storeName, canonical.storeCode).forEach((storeKey) => {
        storeKeys.add(storeKey);
      });
      buildStoreMatchKeys(entry.storeName, entry.storeCode).forEach((storeKey) => {
        storeKeys.add(storeKey);
      });
    }

    storeKeys.forEach((storeKey) => {
      const lookupKey = `${entry.chainName}::${storeKey}::${productKey}`;
      lookup.set(lookupKey, entry.isIntroduced);
    });
  });

  return lookup;
}

function resolveCanonicalIntroductionStore(
  entry: IntroductionMatrixEntry,
  storeLocations: StoreLocationRecord[],
): CanonicalIntroductionStore {
  const chainLookup = buildChainScopedStoreLocationLookup(entry.chainName, storeLocations);
  const matchedLocation = resolveStoreLocationMatch(entry, chainLookup);

  if (matchedLocation) {
    return {
      storeCode: matchedLocation.storeCode,
      storeName: matchedLocation.storeName,
      chainName: entry.chainName,
    };
  }

  return {
    storeCode: entry.storeCode || `import:${normalizeStoreLocationName(entry.storeName) || entry.storeName}`,
    storeName: entry.storeName,
    chainName: entry.chainName,
  };
}

function buildExistingStoreKeys(stores: MatrixStoreRow[]) {
  const codes = new Set<string>();
  const names = new Set<string>();

  stores.forEach((store) => {
    if (store.storeCode) {
      codes.add(store.storeCode);
    }

    const normalizedName = normalizeStoreLocationName(store.storeName);
    if (normalizedName) {
      names.add(normalizedName);
    }
  });

  return { codes, names };
}

function isDuplicateOfExistingStore(
  canonical: CanonicalIntroductionStore,
  existingStoreKeys: ReturnType<typeof buildExistingStoreKeys>,
) {
  if (canonical.storeCode && existingStoreKeys.codes.has(canonical.storeCode)) {
    return true;
  }

  const normalizedName = normalizeStoreLocationName(canonical.storeName);
  return Boolean(normalizedName && existingStoreKeys.names.has(normalizedName));
}

function hasOfficialStoreMasterRows(chainName: string, storeLocations: StoreLocationRecord[]) {
  if (!hasOfficialChainStoreMaster(chainName)) {
    return false;
  }

  return storeLocations.some((location) => belongsToStoreLocationChain(location, chainName));
}

function buildSupplementalIntroducedRows({
  entries,
  products,
  storeLocations,
  introductionLookup,
  coveredRowKeys,
  existingStoreKeys,
  chainFilter,
}: {
  entries: IntroductionMatrixEntry[];
  products: IntroductionMatrixProduct[];
  storeLocations: StoreLocationRecord[];
  introductionLookup: Map<string, boolean>;
  coveredRowKeys: Set<string>;
  existingStoreKeys: ReturnType<typeof buildExistingStoreKeys>;
  chainFilter: string;
}): IntroductionMatrixRow[] {
  const supplementalRows = new Map<string, IntroductionMatrixRow>();

  entries
    .filter((entry) => entry.isIntroduced)
    .forEach((entry) => {
      if (chainFilter !== "all" && entry.chainName !== chainFilter) {
        return;
      }

      // 公式サイト店舗マスタがあるチェーンは、Excel由来の店舗を追加しない（公式を正とする）
      if (hasOfficialChainStoreMaster(entry.chainName)) {
        return;
      }

      const canonical = resolveCanonicalIntroductionStore(entry, storeLocations);
      const rowKey = canonical.storeCode || normalizeStoreLocationName(canonical.storeName) || entry.storeName;

      if (coveredRowKeys.has(rowKey) || isDuplicateOfExistingStore(canonical, existingStoreKeys)) {
        return;
      }

      const matchKeys = canonical.storeCode.startsWith("import:")
        ? buildStoreMatchKeys(canonical.storeName, canonical.storeCode)
        : [`code:${canonical.storeCode}`];
      const introducedByProduct = Object.fromEntries(
        products.map((product) => [
          product.key,
          isProductIntroduced(introductionLookup, matchKeys, product.key, entry.chainName),
        ]),
      ) as Record<string, boolean>;
      const hasAnyIntroduction = products.some((product) => introducedByProduct[product.key]);

      if (!hasAnyIntroduction) {
        return;
      }

      const chainLookup = buildChainScopedStoreLocationLookup(entry.chainName, storeLocations);
      supplementalRows.set(rowKey, {
        rowKey,
        chainName: entry.chainName,
        storeName: canonical.storeName,
        address:
          resolveStoreLocationAddress(
            {
              storeCode: canonical.storeCode,
              storeName: canonical.storeName,
              postalCode: entry.postalCode,
              address: entry.address,
            },
            chainLookup,
          ) || formatStoreLocationAddress(entry),
        introducedByProduct,
        hasAnyIntroduction,
      });
    });

  return Array.from(supplementalRows.values());
}

function dedupeMatrixRows(rows: IntroductionMatrixRow[]) {
  const map = new Map<string, IntroductionMatrixRow>();

  rows.forEach((row) => {
    const normalizedName = normalizeStoreLocationName(row.storeName);
    const key =
      row.rowKey.startsWith("loft-") ||
      row.rowKey.startsWith("hands-") ||
      row.rowKey.startsWith("atcosme-") ||
      row.rowKey.startsWith("ainz-")
        ? `${row.chainName}::code:${row.rowKey}`
        : `${row.chainName}::${normalizedName || row.rowKey}`;
    const current = map.get(key);

    if (
      !current ||
      (!current.hasAnyIntroduction && row.hasAnyIntroduction) ||
      (!current.address && row.address)
    ) {
      map.set(key, row);
    }
  });

  return Array.from(map.values());
}

function isProductIntroduced(
  lookup: Map<string, boolean>,
  storeMatchKeys: string[],
  productKey: string,
  chainName: string,
) {
  return storeMatchKeys.some(
    (storeKey) => lookup.get(`${chainName}::${storeKey}::${productKey}`) === true,
  );
}

type MatrixStoreRow = StoreLocation & {
  chainName?: string;
};

function buildMatrixStoreRows(
  chainFilter: string,
  storeLocations: StoreLocationRecord[],
  entries: IntroductionMatrixEntry[],
): MatrixStoreRow[] {
  if (chainFilter === "all") {
    const chains = Array.from(
      new Set(entries.map((entry) => entry.chainName.trim()).filter(Boolean)),
    );

    if (chains.length === 0) {
      return dedupeStoreRows(
        entries.map((entry) => ({
          ...enrichStoreFromLocations(
            {
              storeCode: entry.storeCode,
              storeName: entry.storeName,
              postalCode: entry.postalCode,
              address: entry.address,
              tel: "",
            },
            storeLocations,
            entry.chainName,
          ),
          chainName: entry.chainName,
        })),
      );
    }

    return dedupeStoreRows(
      chains.flatMap((chainName) =>
        buildMatrixStoreRowsForChain(chainName, storeLocations, entries),
      ),
    );
  }

  return buildMatrixStoreRowsForChain(chainFilter, storeLocations, entries);
}

function buildMatrixStoreRowsForChain(
  chainFilter: string,
  storeLocations: StoreLocationRecord[],
  entries: IntroductionMatrixEntry[],
): MatrixStoreRow[] {
  const filteredEntries = entries.filter(
    (entry) => chainFilter === "all" || entry.chainName === chainFilter,
  );

  if (shouldUseOfficialStoreMaster(chainFilter)) {
    const chainStores = storeLocations
      .filter((location) => belongsToStoreLocationChain(location, chainFilter))
      .map((location) => ({
        ...location,
        chainName: inferStoreLocationChainName(location) || location.chainName,
      }));

    if (chainStores.length > 0) {
      return dedupeStoreRows(chainStores);
    }
  }

  const entryStores = dedupeStoreRows(
    filteredEntries.map((entry) => ({
      ...enrichStoreFromLocations(
        {
          storeCode: entry.storeCode,
          storeName: entry.storeName,
          postalCode: entry.postalCode,
          address: entry.address,
          tel: "",
        },
        storeLocations,
        entry.chainName,
      ),
      chainName: entry.chainName,
    })),
  );

  if (hasCompleteStoreListFromEntries(filteredEntries)) {
    return entryStores;
  }

  const chainStores = storeLocations
    .filter((location) => belongsToStoreLocationChain(location, chainFilter))
    .map((location) => ({
      ...location,
      chainName: inferStoreLocationChainName(location) || location.chainName,
    }));

  if (chainStores.length > 0) {
    return dedupeStoreRows(chainStores);
  }

  return entryStores;
}

function shouldUseOfficialStoreMaster(chainFilter: string) {
  return hasOfficialChainStoreMaster(chainFilter);
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

function enrichStoreFromLocations(
  store: StoreLocation,
  storeLocations: StoreLocationRecord[],
  chainName?: string,
) {
  const lookup = chainName
    ? buildChainScopedStoreLocationLookup(chainName, storeLocations)
    : buildStoreLocationLookup(storeLocations);
  const matched = resolveStoreLocationMatch(store, lookup);

  if (!matched) {
    return store;
  }

  return {
    storeCode: store.storeCode || matched.storeCode,
    storeName: matched.storeName,
    postalCode: matched.postalCode || store.postalCode,
    address: matched.address || store.address,
    tel: matched.tel || store.tel,
  };
}

function dedupeStoreRows(stores: MatrixStoreRow[]) {
  const map = new Map<string, MatrixStoreRow>();

  stores.forEach((store) => {
    const normalizedName = normalizeStoreLocationName(store.storeName);
    const chainPrefix = store.chainName?.trim() ? `${store.chainName.trim()}::` : "";
    const key = store.storeCode
      ? `${chainPrefix}code:${store.storeCode}`
      : `${chainPrefix}${normalizedName || store.storeName}`;
    const current = map.get(key);

    if (
      !current ||
      (!formatStoreLocationAddress(current) && formatStoreLocationAddress(store)) ||
      (!current.chainName && store.chainName)
    ) {
      map.set(key, store);
    }
  });

  return Array.from(map.values());
}

function buildStoreMatchKeys(storeName: string, storeCode: string) {
  const keys = new Set<string>(buildStoreNameMatchKeys(storeName));

  if (storeCode) {
    keys.add(`code:${storeCode}`);
  }

  return Array.from(keys);
}
