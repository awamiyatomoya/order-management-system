import type { StoreLocation } from "@/lib/store-location-matching";

export type ParsedAinzStoreLocation = StoreLocation & {
  officialShopId: string;
};

const AINZ_SHOP_LIST_URL = "https://ainz-tulpe.jp/blogs/shop";

export async function fetchAinzStoreLocationsFromOfficialSite(): Promise<ParsedAinzStoreLocation[]> {
  const response = await fetch(AINZ_SHOP_LIST_URL, {
    headers: {
      "User-Agent": "order-management-system/1.0 (+https://order-management-system-4w3n.vercel.app)",
      Accept: "text/html",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`アインズ公式サイトの取得に失敗しました (${response.status})`);
  }

  return parseAinzShopListHtml(await response.text());
}

export function parseAinzShopListHtml(html: string): ParsedAinzStoreLocation[] {
  const map = new Map<string, ParsedAinzStoreLocation>();
  const pattern =
    /<a href="\/blogs\/shop\/(\d+)"[^>]*class="wl-shop-list__link">[\s\S]*?<h4 class="wl-shop-list__item-title">([^<]+)<\/h4>[\s\S]*?wl-place[^>]*>[\s\S]*?wl-shop-list__item-data__value">([^<]+)<\/div>(?:[\s\S]*?wl-tel[^>]*>[\s\S]*?wl-shop-list__item-data__value">([^<]+)<\/div>)?/gi;

  for (const match of html.matchAll(pattern)) {
    const officialShopId = match[1]?.trim();
    const storeName = match[2]?.trim();
    const address = match[3]?.trim();
    const tel = match[4]?.trim() ?? "";

    if (!officialShopId || !storeName || !address) {
      continue;
    }

    map.set(officialShopId, {
      storeCode: `ainz-${officialShopId}`,
      storeName,
      postalCode: "",
      address,
      tel,
      officialShopId,
    });
  }

  return Array.from(map.values());
}
