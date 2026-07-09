import type { StoreIntroductionFormatKey } from "@/lib/types";
import { normalizeStoreMatchText } from "@/lib/store-matching";

/** 大山・@cosme 店舗割振表の店舗コード → 公式サイト slug */
export const oyamaAtCosmeStoreCodeToSlug: Record<string, string> = {
  "100": "tsutaya-ebisubashi",
  "101": "tsutaya-kumamoto",
  "103": "tsutaya-sapporo",
  "104": "tsutaya-hakodate",
  "302": "aeon-takaoka",
  "303": "aeon-takasaki",
  "304": "maroot-toyama",
  "501": "tokyo",
  "502": "osaka",
  "503": "nagoya",
  "55": "lumine-shinjuku",
  "56": "marui-ueno",
  "61": "lumine-ikebukuro",
  "62": "lumine-yurakucho",
  "63": "marui-mizonokuchi",
  "65": "marui-kobe",
  "66": "sunshine-ikebukuro",
  "67": "amuest-hakata",
  "71": "lumine-omiya",
  "72": "lalaport-fujimi",
  "73": "newoman-yokohama",
  "74": "lumine-yokohama",
  "75": "aeon-urawamisono",
  "76": "lazona-kawasaki",
  "77": "lalaport-toyosu",
  "81": "sydney-kameido",
  "83": "termina-kinshicho",
  "86": "sapporo-stellarplace",
  "87": "kanazawa-forus",
  "88": "newoman-takanawa",
  "89": "mozo-wondercity",
  "600": "misugi-temmabashi",
  "601": "misugi-namba",
};

export function isStoreAllocationIntroductionSheet(
  formatKey: StoreIntroductionFormatKey,
  entries: { storeName?: string; storeCode?: string }[],
) {
  if (formatKey !== "store-allocation-list" || entries.length < 5) {
    return false;
  }

  const oyamaCodeMatches = entries.filter((entry) =>
    Boolean(oyamaAtCosmeStoreCodeToSlug[entry.storeCode?.trim() ?? ""]),
  ).length;

  if (oyamaCodeMatches >= 5) {
    return true;
  }

  const cosmeNameMatches = entries.filter((entry) => {
    const name = normalizeStoreMatchText(entry.storeName ?? "");
    return name.includes("cosme") || name.includes("アットコスメ");
  }).length;

  return cosmeNameMatches >= 3;
}

export function matchStoreAllocationChain(_storeCode: string, _storeName: string) {
  // 大山の店舗割振表は @cosme STORE の導入店舗一覧（イオンモール・TSUTAYA 併設店含む）
  return "@cosme STORE";
}

export function resolveOyamaAtCosmeOfficialStoreCode(storeCode: string) {
  const slug = oyamaAtCosmeStoreCodeToSlug[storeCode.trim()];
  return slug ? `atcosme-${slug}` : "";
}
