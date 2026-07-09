import type { StoreIntroductionFormatKey } from "@/lib/types";
import { normalizeStoreMatchText } from "@/lib/store-matching";

const atCosmeStoreCodePattern = /^(501|502|503|600|601|55|56|61|62|63|65|66|67|71|72|73|74|75|76|77|81|83|86|87|88|89)$/;

const aeonStoreCodePattern = /^(302|303)$/;

export function isStoreAllocationIntroductionSheet(
  formatKey: StoreIntroductionFormatKey,
  entries: { storeName?: string; storeCode?: string }[],
) {
  if (formatKey !== "store-allocation-list" || entries.length < 5) {
    return false;
  }

  const atCosmeMatches = entries.filter((entry) =>
    Boolean(matchStoreAllocationChain(entry.storeCode ?? "", entry.storeName ?? "")),
  ).length;

  return atCosmeMatches >= 5;
}

export function matchStoreAllocationChain(storeCode: string, storeName: string) {
  const normalizedCode = storeCode.trim();
  const normalizedName = normalizeStoreMatchText(storeName);

  if (atCosmeStoreCodePattern.test(normalizedCode)) {
    return "@cosme STORE";
  }

  if (
    aeonStoreCodePattern.test(normalizedCode) ||
    (normalizedName.includes("イオンモール") && !normalizedName.includes("アミュ"))
  ) {
    return "イオン";
  }

  if (normalizedName.includes("cosme") || normalizedName.includes("アットコスメ")) {
    return "@cosme STORE";
  }

  return "";
}
