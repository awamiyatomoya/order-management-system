import { fetchAinzStoreLocationsFromOfficialSite } from "@/lib/ainz-store-locations";
import { fetchAtCosmeStoreLocationsFromOfficialSite } from "@/lib/atcosme-store-locations";
import { fetchHandsStoreLocationsFromOfficialSite } from "@/lib/hands-store-locations";
import { fetchLoftStoreLocationsFromOfficialSite } from "@/lib/loft-store-locations";
import type { StoreLocation } from "@/lib/store-location-matching";

/**
 * 小売チェーン追加時のルール:
 * - 店舗マスタ（店名・住所・全店舗数・導入率）は公式サイトを正とする
 * - 導入有無のみ取込Excelから判定する
 * - 新チェーンは fetcher をここに登録する（Excel住所録を店舗マスタにしない）
 */
export type OfficialStoreChainName = "ハンズ" | "ロフト" | "@cosme STORE" | "アインズ";

type OfficialChainStoreMasterFetcher = () => Promise<StoreLocation[]>;

export const officialChainStoreMasterFetchers: Record<
  OfficialStoreChainName,
  OfficialChainStoreMasterFetcher
> = {
  ハンズ: fetchHandsStoreLocationsFromOfficialSite,
  ロフト: fetchLoftStoreLocationsFromOfficialSite,
  "@cosme STORE": fetchAtCosmeStoreLocationsFromOfficialSite,
  アインズ: fetchAinzStoreLocationsFromOfficialSite,
};

export const officialChainStoreMasterNames = Object.keys(
  officialChainStoreMasterFetchers,
) as OfficialStoreChainName[];

export const officialChainStoreMasters = new Set<string>(officialChainStoreMasterNames);

export function isOfficialStoreChainName(chainName: string): chainName is OfficialStoreChainName {
  return officialChainStoreMasters.has(chainName.trim());
}

export function hasOfficialChainStoreMaster(chainName: string) {
  return isOfficialStoreChainName(chainName);
}

export function parseOfficialStoreChainName(value: string | null | undefined): OfficialStoreChainName | null {
  const normalized = value?.trim() ?? "";
  return isOfficialStoreChainName(normalized) ? normalized : null;
}

export async function fetchOfficialChainStoreLocations(
  chainName: OfficialStoreChainName,
): Promise<StoreLocation[]> {
  return officialChainStoreMasterFetchers[chainName]();
}
