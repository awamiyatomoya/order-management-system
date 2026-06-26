import { normalizeStoreMatchText } from "@/lib/store-matching";

export type StoreChannel = "variety" | "drugstore" | "discount" | "gms" | "cvs" | "other";

const channelChainNames: Record<Exclude<StoreChannel, "other">, string[]> = {
  variety: [
    "ロフト",
    "ハンズ",
    "東急ハンズ",
    "アインズ",
    "PLAZA",
    "プラザ",
    "アットコスメ",
    "@cosme",
    "インキューブ",
    "ミモザ",
    "アフタヌーンティー",
    "アミング",
    "京王アートマン",
    "アートマン",
    "R.O.U",
    "ショップイン",
    "ネットストア",
  ],
  drugstore: [
    "マツモトキヨシ",
    "マツキヨ",
    "ココカラファイン",
    "ウエルシア",
    "ウェルシア",
    "ツルハドラッグ",
    "ツルハ",
    "サンドラッグ",
    "スギ薬局",
    "スギドラッグ",
    "コクミンドラッグ",
    "コクミン",
    "トモズ",
    "クリエイト",
    "セイムス",
    "カワチ薬品",
    "クスリのアオキ",
    "ドラッグストアモリ",
    "ドラモリ",
    "コスモス薬品",
    "キリン堂",
    "サツドラ",
    "ウォンツ",
    "ザグザグ",
    "杏林堂",
    "V・drug",
    "ブイドラッグ",
  ],
  discount: ["ドン・キホーテ", "ドンキホーテ", "ドンキ", "メガドンキ", "MEGAドン・キホーテ"],
  gms: ["イオン", "イトーヨーカドー", "ヨーカドー", "西友", "イズミ", "ゆめタウン", "平和堂", "アル・プラザ"],
  cvs: [
    "セブンイレブン",
    "セブン-イレブン",
    "ファミリーマート",
    "ファミマ",
    "ローソン",
    "ミニストップ",
    "デイリーヤマザキ",
    "ナチュラルローソン",
  ],
};

export type StoreChannelSummary = {
  introduced: number;
  variety: number;
  drugstore: number;
  discount: number;
  gms: number;
  cvs: number;
};

export function classifyStoreChannel(storeName: string, matchedStoreName = "") {
  const normalizedTexts = [storeName, matchedStoreName]
    .filter((value) => value && value !== "店舗不明")
    .map((value) => normalizeStoreMatchText(value));

  if (normalizedTexts.length === 0) {
    return "other" as StoreChannel;
  }

  for (const [channel, chainNames] of Object.entries(channelChainNames) as [
    Exclude<StoreChannel, "other">,
    string[],
  ][]) {
    if (
      chainNames.some((chainName) =>
        normalizedTexts.some(
          (text) =>
            text.includes(normalizeStoreMatchText(chainName)) ||
            normalizeStoreMatchText(chainName).includes(text),
        ),
      )
    ) {
      return channel;
    }
  }

  const combined = normalizedTexts.join("");

  if (combined.includes("ロフト") || combined.includes("loft") || combined.includes("ハンズ")) {
    return "variety";
  }

  if (combined.includes("ドラッグ") || combined.includes("薬局") || combined.includes("薬品")) {
    return "drugstore";
  }

  if (combined.includes("ドンキ")) {
    return "discount";
  }

  if (combined.includes("イオン") || combined.includes("ヨーカドー") || combined.includes("西友")) {
    return "gms";
  }

  if (
    combined.includes("セブン") ||
    combined.includes("ファミリ") ||
    combined.includes("ローソン") ||
    combined.includes("ミニストップ")
  ) {
    return "cvs";
  }

  return "other";
}

export function summarizeIntroducedStoresByChannel(
  entries: { storeName: string; matchedStoreName?: string; isIntroduced: boolean }[],
) {
  const introducedEntries = entries.filter((entry) => entry.isIntroduced);

  const summary: StoreChannelSummary = {
    introduced: introducedEntries.length,
    variety: 0,
    drugstore: 0,
    discount: 0,
    gms: 0,
    cvs: 0,
  };

  introducedEntries.forEach((entry) => {
    const channel = classifyStoreChannel(entry.storeName, entry.matchedStoreName ?? "");

    if (channel === "variety") {
      summary.variety += 1;
    } else if (channel === "drugstore") {
      summary.drugstore += 1;
    } else if (channel === "discount") {
      summary.discount += 1;
    } else if (channel === "gms") {
      summary.gms += 1;
    } else if (channel === "cvs") {
      summary.cvs += 1;
    }
  });

  return summary;
}
