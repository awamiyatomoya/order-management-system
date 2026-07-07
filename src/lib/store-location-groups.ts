import type { StoreLocation } from "@/lib/store-location-matching";

export type StoreLocationRecord = StoreLocation & {
  chainName: string;
};

export function inferStoreLocationChainName(location: Pick<StoreLocation, "storeCode" | "storeName">) {
  if (location.storeCode.startsWith("loft-") || /ロフト|loft/i.test(location.storeName)) {
    return "ロフト";
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
