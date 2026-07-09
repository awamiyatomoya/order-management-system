import type { StoreLocation } from "@/lib/store-location-matching";

export type ParsedLoftStoreLocation = StoreLocation & {
  officialShopId: string;
};

const LOFT_SHOP_LIST_URL = "https://www.loft.co.jp/shop_list/";

export async function fetchLoftStoreLocationsFromOfficialSite(): Promise<ParsedLoftStoreLocation[]> {
  const response = await fetch(LOFT_SHOP_LIST_URL, {
    headers: {
      "User-Agent": "order-management-system/1.0 (+https://order-management-system-4w3n.vercel.app)",
      Accept: "text/html",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ロフト公式サイトの取得に失敗しました (${response.status})`);
  }

  return parseLoftShopListHtml(await response.text());
}

export function parseLoftShopListHtml(html: string): ParsedLoftStoreLocation[] {
  const parts = html.split('class="shopdetail-box"');
  const map = new Map<string, ParsedLoftStoreLocation>();

  for (const part of parts.slice(1)) {
    const nameMatch = part.match(/shop-name[^>]*>\s*<a[^>]*>([^<]+)<\/a>/);
    const idMatch = part.match(/shop_id=(\d+)/);
    const postalMatch = part.match(/shop-postcode[^>]*>〒([^<]+)/);
    const addressMatch = part.match(/shop-address[^>]*>\s*([\s\S]*?)<\/p>/);
    const telMatch = part.match(/(\d{2,4}-\d{2,4}-\d{4})/);

    if (!nameMatch || !idMatch) {
      continue;
    }

    const address = (addressMatch?.[1] ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!address) {
      continue;
    }

    map.set(idMatch[1], {
      storeCode: `loft-${idMatch[1]}`,
      storeName: nameMatch[1].trim(),
      postalCode: postalMatch?.[1]?.trim() ?? "",
      address,
      tel: telMatch?.[1] ?? "",
      officialShopId: idMatch[1],
    });
  }

  return Array.from(map.values());
}

export function mergeLoftLocationsWithExisting(
  loftLocations: ParsedLoftStoreLocation[],
  _existingLocations: StoreLocation[],
): StoreLocation[] {
  return loftLocations.map((loftLocation) => ({
    storeCode: loftLocation.storeCode,
    storeName: loftLocation.storeName,
    postalCode: loftLocation.postalCode,
    address: loftLocation.address,
    tel: loftLocation.tel,
  }));
}
