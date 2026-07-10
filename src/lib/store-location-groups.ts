import type { StoreLocation } from "@/lib/store-location-matching";
import {
  hasOfficialChainStoreMaster,
  officialChainStoreMasters,
} from "@/lib/official-chain-store-masters";

export type StoreLocationRecord = StoreLocation & {
  chainName: string;
};

export { hasOfficialChainStoreMaster, officialChainStoreMasters };

export function inferStoreLocationChainName(location: Pick<StoreLocation, "storeCode" | "storeName">) {
  if (location.storeCode.startsWith("loft-")) {
    return "ロフト";
  }

  if (location.storeCode.startsWith("hands-")) {
    return "ハンズ";
  }

  if (location.storeCode.startsWith("atcosme-")) {
    return "@cosme STORE";
  }

  if (location.storeCode.startsWith("ainz-")) {
    return "アインズ";
  }

  if (/ロフト|loft/i.test(location.storeName)) {
    return "ロフト";
  }

  if (/ハンズ|hands/i.test(location.storeName)) {
    return "ハンズ";
  }

  if (/@cosme|アットコスメ/i.test(location.storeName)) {
    return "@cosme STORE";
  }

  if (/アインズ|ainz/i.test(location.storeName)) {
    return "アインズ";
  }

  return "";
}

export function belongsToStoreLocationChain(
  location: Pick<StoreLocation, "storeCode" | "storeName"> & { chainName?: string },
  chainName: string,
) {
  const inferred = inferStoreLocationChainName(location);
  if (inferred) {
    return inferred === chainName;
  }

  return location.chainName?.trim() === chainName;
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
