import type { StoreLocation } from "@/lib/store-location-matching";

export type ParsedAtCosmeStoreLocation = StoreLocation & {
  officialSlug: string;
};

const ATCOSME_SHOP_LIST_URL = "https://www.cosme.net/store/shop/";

export async function fetchAtCosmeStoreLocationsFromOfficialSite(): Promise<ParsedAtCosmeStoreLocation[]> {
  const response = await fetch(ATCOSME_SHOP_LIST_URL, {
    headers: {
      "User-Agent": "order-management-system/1.0 (+https://order-management-system-4w3n.vercel.app)",
      Accept: "text/html",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`@cosme STORE公式サイトの取得に失敗しました (${response.status})`);
  }

  return parseAtCosmeShopListHtml(await response.text());
}

export function parseAtCosmeShopListHtml(html: string): ParsedAtCosmeStoreLocation[] {
  const map = new Map<string, ParsedAtCosmeStoreLocation>();

  for (const part of html.split("shopTable__item").slice(1)) {
    const hrefMatch = part.match(/href="(\/store\/shop\/[^"]+)"/);
    const slug = hrefMatch?.[1]?.match(/\/shop\/([^/]+)/)?.[1];
    const nameMatch = part.match(/shopTable__name[\s\S]*?<span class="txt">([^<]+)/);
    const addressMatch = part.match(/shopTable__address[\s\S]*?<p>([^<]+)/);

    if (!slug || !nameMatch) {
      continue;
    }

    const addressText = addressMatch?.[1]?.trim() ?? "";
    const postalCode = addressText.match(/^(\d{3}-\d{4})/)?.[1] ?? "";
    const address = addressText.replace(/^\d{3}-\d{4}\s*/, "").trim();

    if (!address) {
      continue;
    }

    map.set(slug, {
      storeCode: `atcosme-${slug}`,
      storeName: nameMatch[1].trim(),
      postalCode,
      address,
      tel: "",
      officialSlug: slug,
    });
  }

  return Array.from(map.values());
}
