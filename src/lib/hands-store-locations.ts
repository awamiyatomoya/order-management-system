import type { StoreLocation } from "@/lib/store-location-matching";

export type ParsedHandsStoreLocation = StoreLocation & {
  officialSlug: string;
};

const HANDS_SHOP_LIST_PAGES = [
  "https://info.hands.net/list/hokkaido.html",
  "https://info.hands.net/list/kanto.html",
  "https://info.hands.net/list/chubu.html",
  "https://info.hands.net/list/kansai.html",
  "https://info.hands.net/list/chugoku.html",
  "https://info.hands.net/list/kyushu.html",
  "https://info.hands.net/list/be.html",
  "https://info.hands.net/list/plugs-market.html",
] as const;

type JsonLdAddress = {
  postalCode?: string;
  addressRegion?: string;
  addressLocality?: string;
  streetAddress?: string;
};

type JsonLdStore = {
  name?: string;
  url?: string;
  telephone?: string;
  address?: JsonLdAddress | string;
};

export async function fetchHandsStoreLocationsFromOfficialSite(): Promise<ParsedHandsStoreLocation[]> {
  const stores: ParsedHandsStoreLocation[] = [];

  for (const pageUrl of HANDS_SHOP_LIST_PAGES) {
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent": "order-management-system/1.0 (+https://order-management-system-4w3n.vercel.app)",
        Accept: "text/html",
      },
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      throw new Error(`ハンズ公式サイトの取得に失敗しました (${pageUrl}: ${response.status})`);
    }

    stores.push(...parseHandsShopListHtml(await response.text()));
  }

  return dedupeHandsStoreLocations(stores);
}

export function parseHandsShopListHtml(html: string): ParsedHandsStoreLocation[] {
  const stores: ParsedHandsStoreLocation[] = [];
  const blocks = html.matchAll(/<script type="application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/g);

  for (const match of blocks) {
    let data: JsonLdStore;

    try {
      data = JSON.parse(match[1]) as JsonLdStore;
    } catch {
      continue;
    }

    const storeName = data.name?.trim() ?? "";
    const officialSlug = extractOfficialSlug(data.url ?? "");

    if (!storeName || !officialSlug) {
      continue;
    }

    const { postalCode, address } = formatJsonLdAddress(data.address);

    if (!address) {
      continue;
    }

    stores.push({
      storeCode: `hands-${officialSlug}`,
      storeName,
      postalCode,
      address,
      tel: normalizeTel(data.telephone ?? ""),
      officialSlug,
    });
  }

  return stores;
}

export function mergeHandsLocationsWithExisting(
  handsLocations: ParsedHandsStoreLocation[],
  _existingLocations: StoreLocation[],
): StoreLocation[] {
  return handsLocations.map((location) => ({
    storeCode: location.storeCode,
    storeName: location.storeName,
    postalCode: location.postalCode,
    address: location.address,
    tel: location.tel,
  }));
}

function dedupeHandsStoreLocations(locations: ParsedHandsStoreLocation[]) {
  const map = new Map<string, ParsedHandsStoreLocation>();

  locations.forEach((location) => {
    const key = location.storeName.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
    map.set(key, location);
  });

  return Array.from(map.values());
}

function extractOfficialSlug(url: string) {
  const trimmed = url.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const pathname = new URL(trimmed).pathname.replace(/\/+$/, "");
    const slug = pathname.split("/").filter(Boolean).at(-1) ?? "";
    return slug.replace(/\.html$/, "");
  } catch {
    return "";
  }
}

function formatJsonLdAddress(address: JsonLdAddress | string | undefined) {
  if (!address) {
    return { postalCode: "", address: "" };
  }

  if (typeof address === "string") {
    return { postalCode: "", address: address.trim() };
  }

  const postalCode = String(address.postalCode ?? "").replace(/\D/g, "");
  const addressParts = [address.addressRegion, address.addressLocality, address.streetAddress]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);

  return {
    postalCode,
    address: addressParts.join(""),
  };
}

function normalizeTel(value: string) {
  return value.replace(/TEL[:：]?\s*/i, "").trim();
}
