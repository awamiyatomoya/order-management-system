import { inferStoreLocationChainName, type StoreLocationRecord } from "@/lib/store-location-groups";

export function listChainStoreLocationCodes(
  locations: StoreLocationRecord[],
  chainName: string,
) {
  return locations
    .filter((location) => {
      const resolvedChain = location.chainName || inferStoreLocationChainName(location);
      return resolvedChain === chainName;
    })
    .map((location) => location.storeCode)
    .filter(Boolean);
}
