import { resolveOyamaAtCosmeOfficialStoreCode } from "@/lib/store-allocation-matching";
import { buildAinzStoreCodeAliases } from "@/lib/store-introduction-parsers";

export type StoreLocation = {
  storeCode: string;
  storeName: string;
  postalCode: string;
  address: string;
  tel: string;
};

const STORE_NAME_PREFIXES = [
  "カラフルタウン",
  "カラフル",
  "ゆめタウン",
  "コスメロフト",
  "コスメ",
  "東京",
  "池袋",
  "プラグスマーケット",
  "ハンズビー",
  "ハンズ",
  "hands",
  "hb",
  "ロフト",
  "loft",
];

const STORE_NAME_SUFFIXES = [
  "インターパークロフト",
  "サンシャインシティロフト",
  "バンパクロフト",
  "ミロード店",
  "パルコロフ",
  "ロフト",
  "loft",
  "ロフ",
  "店",
];

const TRUNCATED_STORE_NAME_ALIASES: Record<string, string[]> = {
  コスメノノワク: ["nonowa"],
  コスメグラ東京: ["グランスタ"],
  コスメイクスピ: ["イクスピアリ"],
  コスメ本厚木: ["本厚木"],
  コスメ武蔵小金: ["武蔵小金井", "nonowa"],
  コスメシァル鶴: ["シァル", "鶴見"],
};

export function looksLikeStoreAddress(value: string) {
  const trimmed = (value ?? "").trim();
  if (trimmed.length < 4) {
    return false;
  }

  return !/^\d+$/.test(trimmed);
}

export function normalizeStoreLocationName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/[髙𠮷]/g, (char) => (char === "髙" ? "高" : "吉"))
    .replace(/﨑/g, "崎")
    .replace(/濵/g, "浜");
}

export function buildStoreNameMatchKeys(storeName: string) {
  const keys = new Set<string>();
  const normalized = normalizeStoreLocationName(storeName);

  if (!normalized) {
    return [];
  }

  keys.add(normalized);

  const variants = new Set<string>([normalized]);

  for (const variant of [...variants]) {
    for (const prefix of STORE_NAME_PREFIXES) {
      if (variant.startsWith(prefix) && variant.length > prefix.length + 1) {
        variants.add(variant.slice(prefix.length));
      }
    }
  }

  for (const variant of [...variants]) {
    for (const suffix of STORE_NAME_SUFFIXES) {
      if (variant.endsWith(suffix) && variant.length > suffix.length + 1) {
        variants.add(variant.slice(0, -suffix.length));
      }
    }
  }

  for (const prefix of STORE_NAME_PREFIXES) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length + 1) {
      variants.add(normalized.slice(prefix.length));
    }
  }

  for (const suffix of STORE_NAME_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length + 1) {
      variants.add(normalized.slice(0, -suffix.length));
    }
  }

  variants.forEach((variant) => {
    if (variant.length >= 2) {
      keys.add(variant);
    }
  });

  return Array.from(keys);
}

export function formatStoreLocationAddress(location: Pick<StoreLocation, "postalCode" | "address">) {
  const postalCode = location.postalCode.trim();
  const address = stripLeadingPostalCodes(location.address.trim());

  if (postalCode && address) {
    return `${postalCode} ${address}`;
  }

  return postalCode || address;
}

function stripLeadingPostalCodes(address: string) {
  let normalized = address.trim();
  let previous = "";

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/^(\d{3}-\d{4})\s+/, "")
      .replace(/^(\d{7})\s+/, "");
  }

  return normalized;
}

export function buildStoreLocationLookup(locations: StoreLocation[]) {
  const byCode = new Map<string, StoreLocation>();
  const byName = new Map<string, StoreLocation>();

  locations.forEach((location) => {
    const codeAliases = buildAinzStoreCodeAliases(location.storeCode);
    codeAliases.forEach((storeCode) => {
      if (storeCode) {
        byCode.set(storeCode, location);
      }
    });

    buildStoreNameMatchKeys(location.storeName).forEach((key) => {
      if (!byName.has(key)) {
        byName.set(key, location);
      }
    });
  });

  return { byCode, byName };
}

function isExcelInternalStoreCode(storeCode: string) {
  return /^\d{2,4}$/.test(storeCode.trim());
}

const CHAIN_MARKERS: Array<{ chain: string; pattern: RegExp }> = [
  { chain: "ロフト", pattern: /ロフト|loft/ },
  { chain: "ハンズ", pattern: /ハンズ|hands/ },
  { chain: "アインズ", pattern: /アインズ|ainz/ },
  { chain: "@cosme", pattern: /@cosme|アットコスメ/ },
  { chain: "ドン・キホーテ", pattern: /ドンキ|ドン・キホーテ|donki|ピカソ|長崎屋|情熱職人/ },
];

/** 店名そのものが名乗っているチェーン。判別できなければ空文字。 */
function getStoreNameChainMarker(storeName: string) {
  const normalized = normalizeStoreLocationName(storeName);
  return CHAIN_MARKERS.find(({ pattern }) => pattern.test(normalized))?.chain ?? "";
}

/** 店名が別チェーンを名乗っている組み合わせを弾く（ハンズ渋谷店 → 渋谷ロフト の防止） */
function isChainConsistentMatch(entryStoreName: string, candidate: StoreLocation) {
  const entryChain = getStoreNameChainMarker(entryStoreName);
  if (!entryChain) {
    return true;
  }

  const candidateChain = getStoreNameChainMarker(candidate.storeName);
  if (!candidateChain) {
    return true;
  }

  return entryChain === candidateChain;
}

export function resolveStoreLocationMatch(
  entry: Pick<StoreLocation, "storeCode" | "storeName" | "postalCode" | "address">,
  lookup: ReturnType<typeof buildStoreLocationLookup>,
  options?: StoreLocationMatchOptions,
) {
  const matched = resolveStoreLocationCandidate(entry, lookup, options);

  if (matched && !isChainConsistentMatch(entry.storeName, matched)) {
    return undefined;
  }

  return matched;
}

function resolveStoreLocationCandidate(
  entry: Pick<StoreLocation, "storeCode" | "storeName" | "postalCode" | "address">,
  lookup: ReturnType<typeof buildStoreLocationLookup>,
  options?: StoreLocationMatchOptions,
) {
  if (!entry.storeName.trim() && looksLikeStoreAddress(entry.address)) {
    return undefined;
  }

  const oyamaOfficialCode = resolveOyamaAtCosmeOfficialStoreCode(entry.storeCode);
  if (oyamaOfficialCode) {
    const oyamaMatch = lookup.byCode.get(oyamaOfficialCode);
    if (oyamaMatch) {
      return oyamaMatch;
    }
  }

  for (const key of buildStoreNameMatchKeys(entry.storeName)) {
    const byName = lookup.byName.get(key);
    if (byName) {
      return byName;
    }
  }

  // ロフトは曖昧一致より先に、店名の完全一致で確定させる
  const loftMatch = findLoftStoreLocationMatch(entry.storeName, lookup.byName);
  if (loftMatch) {
    return loftMatch;
  }

  const looseMatch = findLooseStoreLocationMatch(entry.storeName, lookup.byName);
  if (looseMatch) {
    return looseMatch;
  }

  const cosmeticMatch = findCosmeticLoftStoreMatch(entry.storeName, lookup.byName);
  if (cosmeticMatch) {
    return cosmeticMatch;
  }

  const truncatedMatch = findTruncatedStoreNameMatch(entry.storeName, lookup.byName);
  if (truncatedMatch) {
    return truncatedMatch;
  }

  const handsMatch = findHandsStoreLocationMatch(entry.storeName, lookup.byName);
  if (handsMatch) {
    return handsMatch;
  }

  if (entry.storeCode && !isExcelInternalStoreCode(entry.storeCode)) {
    const byCode = lookup.byCode.get(entry.storeCode);
    if (byCode) {
      return byCode;
    }
  }

  if (entry.storeCode) {
    const byCode = lookup.byCode.get(entry.storeCode);
    if (byCode && storeNamesLikelyMatch(entry.storeName, byCode.storeName)) {
      return byCode;
    }
  }

  return findUniqueStoreLocationCandidate(
    entry.storeName,
    listUniqueStoreLocations(lookup),
    options,
  );
}

export type StoreLocationMatchOptions = {
  /** 導入店舗として導入済みの公式店舗コード。複数候補の絞り込みに使う。 */
  introducedStoreCodes?: Set<string>;
};

export function findUniqueStoreLocationCandidate(
  storeName: string,
  locations: StoreLocation[],
  options?: StoreLocationMatchOptions,
): StoreLocation | undefined {
  const queries = buildUniqueCandidateQueries(storeName);
  if (queries.length === 0 || locations.length === 0) {
    return undefined;
  }

  const normalizedQuery = normalizeStoreLocationName(storeName);
  const matches = new Map<string, StoreLocation>();

  locations.forEach((location) => {
    const candidate = normalizeStoreLocationName(location.storeName);
    if (!candidate) {
      return;
    }

    const isMatch = queries.some((query) => candidate.includes(query));
    if (!isMatch) {
      return;
    }

    matches.set(location.storeCode || location.storeName, location);
  });

  let candidates = Array.from(matches.values());

  // Excelにビー/HBの記載がなければ、ハンズビー店舗は候補から外す
  if (!queryMentionsHandsBe(normalizedQuery)) {
    const withoutBe = candidates.filter((location) => !isHandsBeLocation(location));
    if (withoutBe.length > 0) {
      candidates = withoutBe;
    }
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  // 複数残る場合は「店名の核がクエリと一致」するものだけに絞る（柏 → ハンズ柏店）
  const exactPlaceMatches = candidates.filter((location) =>
    isExactPlaceNameMatch(normalizedQuery, location.storeName),
  );

  if (exactPlaceMatches.length === 1) {
    return exactPlaceMatches[0];
  }

  // 導入済み店舗だけで1件に絞れるならそれを採用
  const introducedCodes = options?.introducedStoreCodes;
  if (introducedCodes && introducedCodes.size > 0 && candidates.length > 1) {
    const introducedMatches = candidates.filter((location) =>
      introducedCodes.has(location.storeCode),
    );

    if (introducedMatches.length === 1) {
      return introducedMatches[0];
    }

    const introducedExact = introducedMatches.filter((location) =>
      isExactPlaceNameMatch(normalizedQuery, location.storeName),
    );
    if (introducedExact.length === 1) {
      return introducedExact[0];
    }
  }

  return undefined;
}

function isHandsBeLocation(location: StoreLocation) {
  const code = location.storeCode.trim().toLowerCase();
  if (code.startsWith("hands-be_") || code.startsWith("hands-be-") || code === "hands-be") {
    return true;
  }

  const normalized = normalizeStoreLocationName(location.storeName);
  return normalized.includes("ハンズビー") || normalized.startsWith("hb");
}

function isExactPlaceNameMatch(normalizedQuery: string, storeName: string) {
  const core = normalizeHandsStoreMatchName(storeName)
    .replace(/^ハンズビー/, "")
    .replace(/^ハンズ/, "");

  return core === normalizedQuery;
}

function queryMentionsHandsBe(normalizedQuery: string) {
  return /ハンズビー|^hb|ｈｂ/.test(normalizedQuery) || normalizedQuery.includes("ビー");
}

function buildUniqueCandidateQueries(storeName: string) {
  const normalized = normalizeStoreLocationName(storeName);
  if (!normalized) {
    return [] as string[];
  }

  const queries = new Set<string>([normalized]);

  if (/sq|エスキュ/.test(normalized)) {
    queries.add(normalized.replace(/sq|エスキュ/g, "スクエア"));
    queries.add(normalized.replace(/sq|エスキュ/g, "スクランブルスクエア"));
  }

  return Array.from(queries).filter((query) => query.length >= 1);
}

function listUniqueStoreLocations(lookup: ReturnType<typeof buildStoreLocationLookup>) {
  const locations = new Map<string, StoreLocation>();

  lookup.byName.forEach((location) => {
    locations.set(location.storeCode || location.storeName, location);
  });

  lookup.byCode.forEach((location) => {
    locations.set(location.storeCode || location.storeName, location);
  });

  return Array.from(locations.values());
}

export function resolveStoreLocationAddress(
  entry: Pick<StoreLocation, "storeCode" | "storeName" | "postalCode" | "address">,
  lookup: ReturnType<typeof buildStoreLocationLookup>,
) {
  if (looksLikeStoreAddress(entry.address)) {
    return formatStoreLocationAddress(entry);
  }

  const matched = resolveStoreLocationMatch(entry, lookup);

  if (!matched) {
    return "";
  }

  return formatStoreLocationAddress(matched);
}

function storeNamesLikelyMatch(left: string, right: string) {
  const leftKeys = new Set(buildStoreNameMatchKeys(left));
  return buildStoreNameMatchKeys(right).some((key) => leftKeys.has(key));
}

function findLooseStoreLocationMatch(
  storeName: string,
  byName: Map<string, StoreLocation>,
) {
  const matchKeys = buildStoreNameMatchKeys(storeName).filter((key) => key.length >= 3);

  for (const normalizedName of matchKeys) {
    for (const [candidateName, location] of byName) {
      if (candidateName.length < 3) {
        continue;
      }

      if (candidateName.startsWith(normalizedName) || normalizedName.startsWith(candidateName)) {
        return location;
      }

      if (normalizedName.length >= 4 && candidateName.includes(normalizedName)) {
        return location;
      }

      if (candidateName.length >= 4 && normalizedName.includes(candidateName)) {
        return location;
      }

      const core = normalizedName.slice(0, Math.min(6, normalizedName.length));
      if (core.length >= 4 && candidateName.includes(core)) {
        return location;
      }
    }
  }

  return undefined;
}

function findCosmeticLoftStoreMatch(
  storeName: string,
  byName: Map<string, StoreLocation>,
) {
  const normalized = normalizeStoreLocationName(storeName);
  if (!normalized.startsWith("コスメ")) {
    return undefined;
  }

  const core = normalized.replace(/^コスメ/, "");
  if (core.length < 3) {
    return undefined;
  }

  const cosmeticStores = Array.from(byName.values()).filter((location) =>
    normalizeStoreLocationName(location.storeName).startsWith("コスメロフト"),
  );

  let bestMatch: StoreLocation | undefined;
  let bestScore = 0;

  for (const location of cosmeticStores) {
    const candidate = normalizeStoreLocationName(location.storeName).replace(/^コスメロフト/, "");
    let score = 0;

    for (let length = Math.min(core.length, 8); length >= 2; length -= 1) {
      const fragment = core.slice(0, length);
      if (candidate.includes(fragment)) {
        score = length;
        break;
      }
    }

    if (score === 0) {
      for (let length = Math.min(candidate.length, 8); length >= 2; length -= 1) {
        const fragment = candidate.slice(0, length);
        if (core.includes(fragment)) {
          score = length;
          break;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = location;
    }
  }

  return bestScore >= 2 ? bestMatch : undefined;
}

export function normalizeHandsStoreMatchName(value: string) {
  return normalizeStoreLocationName(value)
    .replace(/^hb/, "ハンズビー")
    .replace(/ハンズビーハンズ/, "ハンズ")
    .replace(/city/g, "シティ")
    .replace(/northgate/g, "")
    .replace(/パルコシティ/g, "")
    .replace(/\d+店$/, "")
    .replace(/店$/, "");
}

export function normalizeLoftStoreMatchName(value: string) {
  return normalizeStoreLocationName(value)
    .replace(/万博/g, "バンパク")
    .replace(/ロフト/g, "")
    .replace(/loft/g, "")
    .replace(/店$/, "");
}

/** POS表記（新神戸・千里万博など）を公式店名へ完全一致で寄せる。曖昧一致はしない。 */
function findLoftStoreLocationMatch(storeName: string, byName: Map<string, StoreLocation>) {
  const query = normalizeLoftStoreMatchName(storeName);
  if (query.length < 2) {
    return undefined;
  }

  const loftLocations = Array.from(
    new Map(
      Array.from(byName.values())
        .filter((location) => isLoftLocation(location))
        .map((location) => [location.storeCode || location.storeName, location] as const),
    ).values(),
  );

  if (loftLocations.length === 0) {
    return undefined;
  }

  // 「新○○」は建て替え後のPOS表記で、公式は「○○」のことがある
  const queries = query.startsWith("新") && query.length >= 3 ? [query, query.slice(1)] : [query];

  for (const candidateQuery of queries) {
    const matches = loftLocations.filter(
      (location) => normalizeLoftStoreMatchName(location.storeName) === candidateQuery,
    );

    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      return undefined;
    }
  }

  return undefined;
}

function isLoftLocation(location: StoreLocation) {
  if (location.storeCode.startsWith("loft-")) {
    return true;
  }

  const normalized = normalizeStoreLocationName(location.storeName);
  return normalized.includes("ロフト") || normalized.includes("loft");
}

function findHandsStoreLocationMatch(
  storeName: string,
  byName: Map<string, StoreLocation>,
) {
  const normalizedEntry = normalizeHandsStoreMatchName(storeName);
  if (normalizedEntry.length < 3) {
    return undefined;
  }

  const handsLocations = Array.from(byName.values()).filter(
    (location) =>
      location.storeCode.startsWith("hands-") ||
      normalizeStoreLocationName(location.storeName).includes("ハンズ"),
  );

  if (handsLocations.length === 0) {
    return undefined;
  }

  let bestMatch: StoreLocation | undefined;
  let bestScore = 0;

  for (const location of handsLocations) {
    const normalizedCandidate = normalizeHandsStoreMatchName(location.storeName);
    let score = 0;

    if (normalizedEntry === normalizedCandidate) {
      score = 1000;
    } else if (
      normalizedEntry.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedEntry)
    ) {
      score = Math.min(normalizedEntry.length, normalizedCandidate.length) + 100;
    } else {
      for (let length = Math.min(normalizedEntry.length, 10); length >= 4; length -= 1) {
        const fragment = normalizedEntry.slice(0, length);
        if (normalizedCandidate.includes(fragment)) {
          score = length;
          break;
        }
      }

      if (score === 0) {
        for (let length = Math.min(normalizedCandidate.length, 10); length >= 4; length -= 1) {
          const fragment = normalizedCandidate.slice(0, length);
          if (normalizedEntry.includes(fragment)) {
            score = length;
            break;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = location;
    }
  }

  return bestScore >= 4 ? bestMatch : undefined;
}

function findTruncatedStoreNameMatch(
  storeName: string,
  byName: Map<string, StoreLocation>,
) {
  const normalized = normalizeStoreLocationName(storeName);
  const aliases = TRUNCATED_STORE_NAME_ALIASES[normalized];

  if (!aliases) {
    return undefined;
  }

  const locations = Array.from(byName.values());

  for (const alias of aliases) {
    const normalizedAlias = normalizeStoreLocationName(alias);
    const matched = locations.find((location) =>
      normalizeStoreLocationName(location.storeName).includes(normalizedAlias),
    );

    if (matched) {
      return matched;
    }
  }

  return undefined;
}
