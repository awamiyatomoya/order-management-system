function normalizeRetailMatchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・･\\/／\-ー‐‑‒–—―_,，、.．()（）［\]\[【】]/g, "");
}

const atCosmeNameTokens = [
  "cosme",
  "アットコスメ",
  "ルミネ",
  "マルイ",
  "ニュウマン",
  "アミュエスト",
  "天満橋",
  "なんばウォーク",
  "サンシャイン",
  "mozo",
  "フォーラス",
  "ステラプレイス",
  "ラゾーナ",
  "ららぽーと",
  "シドニー",
  "錦糸町",
  "マルート",
  "tsutaya",
  "イオンモール高崎",
  "イオンモール高岡",
  "イオンモール浦和美園",
  "アトレ亀戸",
  "金沢",
];

const aeonChainPrefixes = [
  "イオンスタイル",
  "イオンリテール",
  "イオンスーパー",
  "イオンモール",
  "aeon",
];

export function scoreAtCosmeStoreName(storeName: string) {
  const memo = normalizeRetailMatchText(storeName);
  if (!memo) {
    return 0;
  }

  if (memo.includes("cosme") || memo.includes("アットコスメ")) {
    return 1000 + memo.length;
  }

  let best = 0;
  for (const token of atCosmeNameTokens) {
    const normalizedToken = normalizeRetailMatchText(token);
    if (!normalizedToken) {
      continue;
    }

    if (memo.includes(normalizedToken) || normalizedToken.includes(memo)) {
      best = Math.max(best, 500 + normalizedToken.length);
    }
  }

  return best;
}

export function scoreAeonChainName(storeName: string) {
  const memo = normalizeRetailMatchText(storeName);
  if (!memo) {
    return 0;
  }

  if (scoreAtCosmeStoreName(storeName) > 0) {
    return 0;
  }

  for (const prefix of aeonChainPrefixes) {
    const normalizedPrefix = normalizeRetailMatchText(prefix);
    if (memo.startsWith(normalizedPrefix)) {
      return memo.length + 200;
    }
  }

  return 0;
}

export function isLikelyAtCosmeStoreName(storeName: string) {
  return scoreAtCosmeStoreName(storeName) > 0;
}

export function isLikelyAeonChainStoreName(storeName: string) {
  return scoreAeonChainName(storeName) > 0;
}
