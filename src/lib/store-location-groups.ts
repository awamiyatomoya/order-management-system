import type { StoreLocation } from "@/lib/store-location-matching";

export type StoreLocationRecord = StoreLocation & {
  chainName: string;
};

export function inferStoreLocationChainName(location: Pick<StoreLocation, "storeCode" | "storeName">) {
  if (location.storeCode.startsWith("loft-") || /ロフト|loft/i.test(location.storeName)) {
    return "ロフト";
  }

  if (location.storeCode.startsWith("hands-") || /ハンズ|hands/i.test(location.storeName)) {
    return "ハンズ";
  }

  if (
    location.storeCode.startsWith("atcosme-") ||
    /@cosme|アットコスメ/i.test(location.storeName)
  ) {
    return "@cosme STORE";
  }

  return "";
}

export function groupStoreLocationsByChain(
  locations: StoreLocationRecord[],
): Map<string, StoreLocationRecord[]> {
  const grouped = new Map<string, StoreLocationRecord[]>();

  locations.forEach((location) => {
    const chainName = location.chainName || inferStoreLocationChainName(location);
    if (!chainName) {
      return;
    }

    const current = grouped.get(chainName) ?? [];
    current.push({ ...location, chainName });
    grouped.set(chainName, current);
  });

  grouped.forEach((chainLocations, chainName) => {
    grouped.set(
      chainName,
      chainLocations.sort((left, right) => left.storeName.localeCompare(right.storeName, "ja")),
    );
  });

  return grouped;
}

export function countHandsStoreLocations(locations: StoreLocationRecord[]) {
  return countChainStoreLocations(locations, "ハンズ");
}

export function countChainStoreLocations(locations: StoreLocationRecord[], chainName: string) {
  return groupStoreLocationsByChain(locations).get(chainName)?.length ?? 0;
}

export const officialChainStoreMasters = new Set(["ハンズ", "ロフト", "@cosme STORE"]);

export function hasOfficialChainStoreMaster(chainName: string) {
  return officialChainStoreMasters.has(chainName.trim());
}

export function filterStoreLocations(
  locations: StoreLocationRecord[],
  search: string,
): StoreLocationRecord[] {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return locations;
  }

  return locations.filter((location) => {
    return [location.storeCode, location.storeName, location.postalCode, location.address, location.tel]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });
}
