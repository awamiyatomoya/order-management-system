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
  const trimmed = value.trim();
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
    .replace(/[()（）]/g, "");
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
    if (location.storeCode) {
      byCode.set(location.storeCode, location);
    }

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

export function resolveStoreLocationMatch(
  entry: Pick<StoreLocation, "storeCode" | "storeName" | "postalCode" | "address">,
  lookup: ReturnType<typeof buildStoreLocationLookup>,
) {
  if (looksLikeStoreAddress(entry.address)) {
    return undefined;
  }

  for (const key of buildStoreNameMatchKeys(entry.storeName)) {
    const byName = lookup.byName.get(key);
    if (byName) {
      return byName;
    }
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
    return lookup.byCode.get(entry.storeCode);
  }

  if (entry.storeCode) {
    const byCode = lookup.byCode.get(entry.storeCode);
    if (byCode && storeNamesLikelyMatch(entry.storeName, byCode.storeName)) {
      return byCode;
    }
  }

  return undefined;
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
