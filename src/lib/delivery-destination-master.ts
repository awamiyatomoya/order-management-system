export type DeliveryDestination = {
  code: string;
  wholesalerName?: string;
  name: string;
  postalCode: string;
  address1: string;
  address2: string;
  address3: string;
  tel: string;
  aliases: string[];
};

export function getDeliveryDestinationStorageKey(
  destination: Pick<DeliveryDestination, "code" | "wholesalerName">,
) {
  return `${destination.wholesalerName ?? ""}:${destination.code}`;
}

export function mergeDeliveryDestinations(destinations: DeliveryDestination[]) {
  const destinationsByCode = new Map<string, DeliveryDestination>();

  destinations.forEach((destination) => {
    const current = destinationsByCode.get(destination.code);

    if (!current || (!current.wholesalerName && destination.wholesalerName)) {
      destinationsByCode.set(destination.code, destination);
    }
  });

  return Array.from(destinationsByCode.values()).sort((a, b) => a.code.localeCompare(b.code, "ja"));
}

export const deliveryDestinations: DeliveryDestination[] = [
  {
    "wholesalerName": "大山",
    "code": "081701",
    "name": "株式会社大山",
    "postalCode": "103-0007",
    "address1": "東京都中央区日本橋浜町1-9-12　日本橋ﾌﾟﾗﾔﾋﾞﾙ 6Ｆ",
    "address2": "",
    "address3": "",
    "tel": "03-6858-3947",
    "aliases": [
      "株式会社大山"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701J",
    "name": "㈱フィットエクスプレス埼玉センター",
    "postalCode": "343-0824",
    "address1": "埼玉県越谷市流通団地1-1-17",
    "address2": "",
    "address3": "",
    "tel": "048-989-4311",
    "aliases": [
      "㈱フィットエクスプレス埼玉センター",
      "K.K オオヤマ サイタマ リュウツウ センター",
      "K.K オオヤマ サイタマリュウツウセンター",
      "オオヤマ サイタマ"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701P",
    "name": "㈱フィットエクスプレス福岡センター",
    "postalCode": "811-2315",
    "address1": "福岡県糟屋郡粕屋町甲仲原4-4-1 SRC　福岡営業所内4F",
    "address2": "",
    "address3": "",
    "tel": "092-957-1220",
    "aliases": [
      "㈱フィットエクスプレス福岡センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ｵ",
    "name": "株式会社大山埼玉流通センターM倉庫",
    "postalCode": "343-0824",
    "address1": "埼玉県越谷市流通団地1-1-17",
    "address2": "",
    "address3": "",
    "tel": "048-989-4311",
    "aliases": [
      "株式会社大山埼玉流通センターM倉庫",
      "K.K オオヤマ サイタマ リュウツウ センター",
      "K.K オオヤマ サイタマリュウツウセンター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾂ",
    "name": "㈱フィットエクスプレス泉大津センター",
    "postalCode": "595-0074",
    "address1": "大阪府泉大津市小津島町4-12 堺SRC６F",
    "address2": "",
    "address3": "",
    "tel": "0725-32-6031",
    "aliases": [
      "㈱フィットエクスプレス泉大津センター",
      "K.K オオヤマ オオサカ イズミオオツ センター",
      "K.K オオヤマ オオサカ イズミオオツ",
      "オオヤマ イズミオオツ",
      "泉大津センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾃ",
    "name": "㈱フィットエクスプレス仙台センター",
    "postalCode": "983-0034",
    "address1": "宮城県仙台市宮城野区扇町7-5-11-2F SGL　仙台支店内",
    "address2": "",
    "address3": "",
    "tel": "022-258-4000",
    "aliases": [
      "㈱フィットエクスプレス仙台センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾄ",
    "name": "㈱フィットエクスプレス札幌センター",
    "postalCode": "003-0011",
    "address1": "北海道札幌市白石区中央一条１丁目1-15 SGL　札幌営業所内",
    "address2": "",
    "address3": "",
    "tel": "011-811-8111",
    "aliases": [
      "㈱フィットエクスプレス札幌センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾅ",
    "name": "㈱フィットエクスプレススギSLC",
    "postalCode": "486-0804",
    "address1": "愛知県春日井市鷹来町3181-1",
    "address2": "",
    "address3": "",
    "tel": "0568-85-9022",
    "aliases": [
      "㈱フィットエクスプレススギSLC"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾆ",
    "name": "㈱フィットエクスプレススギ岡崎センター",
    "postalCode": "444-0204",
    "address1": "愛知県岡崎市土井町字南赤部内11-1(株)マルヒデ運送内",
    "address2": "",
    "address3": "",
    "tel": "0564-72-5252",
    "aliases": [
      "㈱フィットエクスプレススギ岡崎センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾇ",
    "name": "㈱フィットエクスプレス越谷SLセンター",
    "postalCode": "343-0824",
    "address1": "埼玉県越谷市流通団地3-3-6　㈱ターボ商事2F",
    "address2": "",
    "address3": "",
    "tel": "048-989-0094",
    "aliases": [
      "㈱フィットエクスプレス越谷SLセンター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾈ",
    "name": "㈱フィットエクスプレスユタカDC",
    "postalCode": "503-0944",
    "address1": "岐阜県大垣市横曽根3-1-2　ウェルネッセ流通センター内",
    "address2": "",
    "address3": "",
    "tel": "0584-87-1200",
    "aliases": [
      "㈱フィットエクスプレスユタカDC"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾉ",
    "name": "㈱フィットエクスプレス多摩センター",
    "postalCode": "196-0021",
    "address1": "東京都昭島市武蔵野3-3-2　(株)エーアンドティー多摩物流センター内",
    "address2": "",
    "address3": "",
    "tel": "042-544-0661",
    "aliases": [
      "㈱フィットエクスプレス多摩センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾊ",
    "name": "㈱フィットエクスプレス越谷SLセンターM倉庫",
    "postalCode": "343-0824",
    "address1": "埼玉県越谷市流通団地3-3-6　㈱ターボ商事2F",
    "address2": "",
    "address3": "",
    "tel": "048-989-0094",
    "aliases": [
      "㈱フィットエクスプレス越谷SLセンターM倉庫"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾋ",
    "name": "㈱フィットエクスプレス泉大津センターM倉庫",
    "postalCode": "595-0074",
    "address1": "大阪府泉大津市小津島町4-12 堺SRC６F",
    "address2": "",
    "address3": "",
    "tel": "0725-32-6031",
    "aliases": [
      "㈱フィットエクスプレス泉大津センターM倉庫"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾌ",
    "name": "㈱フィットエクスプレス名古屋センター",
    "postalCode": "455-0064",
    "address1": "愛知県名古屋市港区本宮町2-35-1　SRC3F",
    "address2": "",
    "address3": "",
    "tel": "052-652-4533",
    "aliases": [
      "㈱フィットエクスプレス名古屋センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾍ",
    "name": "㈱フィットエクスプレス埼玉第三センター",
    "postalCode": "343-0824",
    "address1": "埼玉県越谷市流通団地3-3-13",
    "address2": "",
    "address3": "",
    "tel": "048-984-7146",
    "aliases": [
      "㈱フィットエクスプレス埼玉第三センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾎ",
    "name": "㈱フィットエクスプレスICセンター",
    "postalCode": "343-0822",
    "address1": "埼玉県越谷市西方2722-1",
    "address2": "",
    "address3": "",
    "tel": "048-940-3017",
    "aliases": [
      "㈱フィットエクスプレスICセンター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾏ",
    "name": "株式会社大山千里センター",
    "postalCode": "567-0057",
    "address1": "大阪府茨木市豊川5-555-1　佐川グローバルロジスティクス(株)3F",
    "address2": "",
    "address3": "",
    "tel": "072-640-5582",
    "aliases": [
      "株式会社大山千里センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081701ﾒ",
    "name": "株式会社大山蓮田センター",
    "postalCode": "349-0101",
    "address1": "埼玉県蓮田市黒浜1145-3(株)　キョーワ流通サービス蓮田センター内",
    "address2": "",
    "address3": "",
    "tel": "048-765-7851",
    "aliases": [
      "株式会社大山蓮田センター"
    ]
  },
  {
    "wholesalerName": "大山",
    "code": "081702ﾐ",
    "name": "株式会社大山　広島物流センター",
    "postalCode": "730-0835",
    "address1": "広島県広島市中区江波南2丁目15-26佐川GL広島江波営業所４階",
    "address2": "",
    "address3": "",
    "tel": "082-295-1313",
    "aliases": [
      "株式会社大山　広島物流センター"
    ]
  }
];

export type DeliveryDestinationMatchMethod =
  | "code"
  | "centerName"
  | "postal"
  | "tel"
  | "alias"
  | "none";

export type DeliveryDestinationMatchResult = {
  destination: DeliveryDestination | null;
  method: DeliveryDestinationMatchMethod;
  needsReview: boolean;
  reviewReasons: string[];
};

export const OYAMA_WHOLESALER_NAME = "大山";
export const ARATA_WHOLESALER_NAME = "あらた";

/**
 * 大山系発注書の「発注元」に必ず印字される本部共通センターコード（株式会社大山）。
 *
 * 発注書には通常、次の2つが並んで載る。
 * - 発注元: 081701（本部共通コード）… 取引先・発注元の識別
 * - お届け先: 081701P / 081701ﾂ 等 … 実際の配送センター
 *
 * PDF全文を走査すると両方ヒットするため、お届け先の個別コードがある場合は
 * 本部共通コードを配送先判定から除外する。
 */
export const OYAMA_ORDER_SOURCE_HEADQUARTERS_CENTER_CODE = "081701";

const shipToBlockStartLabels = ["お届け先", "お届先", "納品先"] as const;
const shipToBlockStopLabels = [
  "お届け先住所",
  "お届先住所",
  "納品先住所",
  "お届け先TEL",
  "お届先TEL",
  "納品先TEL",
  "発注先",
  "発注元",
] as const;

export function isHeadquartersCenterCode(code: string) {
  return normalizeCode(code) === OYAMA_ORDER_SOURCE_HEADQUARTERS_CENTER_CODE;
}

/** 個別センターコードと一緒に検出された大山本部共通コード（081701）を除外する。 */
export function omitOyamaOrderSourceHeadquartersCode(codes: string[]) {
  const hasOtherCenterCode = codes.some((code) => !isHeadquartersCenterCode(code));

  if (!hasOtherCenterCode) {
    return codes;
  }

  return codes.filter((code) => !isHeadquartersCenterCode(code));
}

/** @deprecated omitOyamaOrderSourceHeadquartersCode を使用してください。 */
export const filterRedundantHeadquartersCenterCodes = omitOyamaOrderSourceHeadquartersCode;

export function detectOrderWholesalerName(text: string, isArataPdf = false) {
  if (isArataPdf) {
    return ARATA_WHOLESALER_NAME;
  }

  const normalized = text.normalize("NFKC");

  if (/081701|大山|オオヤマ|ｵｵﾔﾏ|フィットエクスプレス/.test(normalized)) {
    return OYAMA_WHOLESALER_NAME;
  }

  if (/あらた|アラタ|㈱あらた/.test(normalized)) {
    return ARATA_WHOLESALER_NAME;
  }

  return "";
}

export function getDestinationWholesalerName(
  destination: Pick<DeliveryDestination, "wholesalerName" | "name" | "aliases" | "code">,
) {
  if (destination.wholesalerName) {
    return destination.wholesalerName;
  }

  const text = [destination.code, destination.name, ...destination.aliases].join(" ");

  if (/大山|オオヤマ|ｵｵﾔﾏ|081701/i.test(text)) {
    return OYAMA_WHOLESALER_NAME;
  }

  if (/あらた|アラタ/.test(text)) {
    return ARATA_WHOLESALER_NAME;
  }

  return "";
}

export function filterDestinationsByWholesaler(
  destinations: DeliveryDestination[],
  wholesalerName?: string,
) {
  if (!wholesalerName) {
    return destinations;
  }

  return destinations.filter(
    (destination) => getDestinationWholesalerName(destination) === wholesalerName,
  );
}

export function extractShipToSectionText(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => isShipToLabelLine(line));

  if (index === -1) {
    return "";
  }

  const blockLines: string[] = [];

  for (const line of lines.slice(index + 1, index + 8)) {
    if (shipToBlockStopLabels.some((label) => line.includes(label))) {
      break;
    }

    blockLines.push(line);
  }

  return blockLines.join("\n");
}

function isShipToLabelLine(line: string) {
  const trimmed = line.trim();

  if (trimmed.includes("住所") || trimmed.includes("TEL")) {
    return false;
  }

  return shipToBlockStartLabels.some(
    (label) =>
      trimmed === label ||
      trimmed === `${label}:` ||
      trimmed === `${label}：` ||
      trimmed.startsWith(`${label} `),
  );
}

export function extractDeliveryDestinationCodes(
  text: string,
  destinations: DeliveryDestination[] = deliveryDestinations,
) {
  const codes = new Set<string>();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const knownCodes = destinations
    .map((destination) => destination.code)
    .sort((left, right) => right.length - left.length);

  for (const line of lines) {
    const normalizedLine = normalizeCode(line);

    for (const code of knownCodes) {
      const normalizedCode = normalizeCode(code);

      if (
        line === code ||
        normalizedLine === normalizedCode ||
        (normalizedCode.length >= 7 && normalizedLine.includes(normalizedCode))
      ) {
        codes.add(code);
        break;
      }
    }
  }

  return sortExtractedDeliveryDestinationCodes(Array.from(codes));
}

function sortExtractedDeliveryDestinationCodes(codes: string[]) {
  return codes.sort((left, right) => {
    const leftIsPostalOnly = isPostalCodeOnlyDestinationCode(left);
    const rightIsPostalOnly = isPostalCodeOnlyDestinationCode(right);

    if (leftIsPostalOnly !== rightIsPostalOnly) {
      return leftIsPostalOnly ? 1 : -1;
    }

    return right.length - left.length;
  });
}

function isPostalCodeOnlyDestinationCode(code: string) {
  return /^\d{3}-?\d{4}$/.test(code.trim());
}

/** 大山発注書テキストから配送先センターコードを抽出する（発注元の本部コードは除外）。 */
export function extractDeliveryDestinationCodesFromOrderText(
  text: string,
  destinations: DeliveryDestination[] = deliveryDestinations,
) {
  const shipToSectionText = extractShipToSectionText(text);
  const shipToSectionCodes = shipToSectionText
    ? extractDeliveryDestinationCodes(shipToSectionText, destinations)
    : [];

  if (shipToSectionCodes.length > 0) {
    return omitOyamaOrderSourceHeadquartersCode(shipToSectionCodes);
  }

  return omitOyamaOrderSourceHeadquartersCode(extractDeliveryDestinationCodes(text, destinations));
}

export function resolveDeliveryDestination(params: {
  code?: string;
  centerName?: string;
  text?: string;
  address?: string;
  tel?: string;
  wholesalerName?: string;
  destinations?: DeliveryDestination[];
}): DeliveryDestinationMatchResult {
  const allDestinations = [...(params.destinations ?? deliveryDestinations)].sort(
    (left, right) => normalizeCode(right.code).length - normalizeCode(left.code).length,
  );
  const destinations = filterDestinationsByWholesaler(allDestinations, params.wholesalerName);
  const searchText = [params.text, params.address, params.tel, params.centerName]
    .filter(Boolean)
    .join("\n");
  const codesFromText = extractDeliveryDestinationCodesFromOrderText(searchText, destinations);
  const reviewReasons: string[] = [];

  if (params.wholesalerName && destinations.length === 0) {
    return {
      destination: null,
      method: "none",
      needsReview: true,
      reviewReasons: [`${params.wholesalerName} の配送先マスタが登録されていません`],
    };
  }

  if (codesFromText.length > 1) {
    reviewReasons.push(`センターコードが複数見つかりました（${codesFromText.join(" / ")}）`);
  }

  for (const code of codesFromText) {
    const destination = findDestinationByCode(code, destinations);

    if (!destination) {
      continue;
    }

    const reasons = [...reviewReasons];

    if (isHeadquartersCenterCode(code)) {
      reasons.push("センターコードが本部共通コードのみです");
    }

    return {
      destination,
      method: "code",
      needsReview: reasons.length > 0,
      reviewReasons: reasons,
    };
  }

  const normalizedCode = normalizeCode(params.code ?? "");

  if (normalizedCode) {
    const destination = findDestinationByCode(normalizedCode, destinations);

    if (destination) {
      const reasons = [...reviewReasons];

      if (isHeadquartersCenterCode(normalizedCode)) {
        reasons.push("センターコードが本部共通コードのみです");
      }

      return {
        destination,
        method: "code",
        needsReview: reasons.length > 0,
        reviewReasons: reasons,
      };
    }
  }

  const centerNameMatch = matchDestinationByCenterName(params.centerName ?? "", destinations);

  if (centerNameMatch.destination) {
    return {
      destination: centerNameMatch.destination,
      method: "centerName",
      needsReview: true,
      reviewReasons: [...reviewReasons, "配送先コードが見つからないため、センター名で判定しました"],
    };
  }

  if (centerNameMatch.ambiguous) {
    reviewReasons.push("センター名が複数候補と一致しました");
  }

  const postalCode = extractPostalCode(searchText);

  if (postalCode) {
    const postalMatches = findDestinationsByPostalCode(destinations, postalCode);
    const postalMatch = pickBestDestinationMatch(postalMatches, searchText, params.tel);

    if (postalMatch.destination) {
      const reasons = [...reviewReasons];

      if (postalMatches.length > 1) {
        reasons.push(
          `郵便番号 ${postalCode} が複数センターと一致したため、住所・TELで ${postalMatch.destination.code} を特定しました`,
        );
      }

      return {
        destination: postalMatch.destination,
        method: "postal",
        needsReview: reasons.length > 0,
        reviewReasons: reasons,
      };
    }

    if (postalMatch.ambiguous) {
      reviewReasons.push(
        `郵便番号 ${postalCode} が複数センターと一致し、配送先コード・センター名・住所・TELだけでは特定できませんでした`,
      );
    }
  }

  const tel = extractTel(searchText);

  if (tel) {
    const telMatches = destinations.filter(
      (candidate) => normalizeTelDigits(candidate.tel) === tel,
    );
    const telMatch = pickBestDestinationMatch(telMatches, searchText, params.tel);

    if (telMatch.destination) {
      return {
        destination: telMatch.destination,
        method: "tel",
        needsReview: reviewReasons.length > 0,
        reviewReasons,
      };
    }

    if (telMatch.ambiguous) {
      reviewReasons.push("TELが複数センターと一致しました");
    }
  }

  if (codesFromText.length > 0) {
    reviewReasons.push("配送先マスタに一致するセンターが見つかりませんでした");
  } else if (!params.centerName?.trim()) {
    reviewReasons.push("配送先コードまたはセンター名をPDFから特定できませんでした");
  } else {
    reviewReasons.push("配送先マスタに一致するセンターが見つかりませんでした");
  }

  return {
    destination: null,
    method: "none",
    needsReview: true,
    reviewReasons,
  };
}

export function findDeliveryDestination(params: {
  code?: string;
  centerName?: string;
  text?: string;
  address?: string;
  tel?: string;
  wholesalerName?: string;
  destinations?: DeliveryDestination[];
}) {
  return resolveDeliveryDestination(params).destination;
}

export function findDeliveryDestinationByCode(
  code: string,
  destinations: DeliveryDestination[] = deliveryDestinations,
) {
  return findDestinationByCode(code, destinations);
}

export function buildDeliveryAddress(destination: DeliveryDestination) {
  return [
    destination.postalCode,
    destination.address1,
    destination.address2,
    destination.address3,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeCode(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]/gu, "")
    .toUpperCase();

  return normalized.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60),
  );
}

function normalizeText(value: string) {
  return value.normalize("NFKC").replace(/\s/g, "").toUpperCase();
}

export function normalizeTelDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePostalCode(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length !== 7) {
    return "";
  }

  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function extractPostalCode(text: string) {
  const matched = text.match(/\b\d{3}-?\d{4}\b/)?.[0];

  if (!matched) {
    return "";
  }

  return normalizePostalCode(matched);
}

function extractTel(text: string) {
  const hyphenated = text.match(/0\d{1,4}-\d{1,4}-\d{3,4}/)?.[0];

  if (hyphenated) {
    return normalizeTelDigits(hyphenated);
  }

  const digitsOnly = text.match(/0\d{9,10}/)?.[0];

  return digitsOnly ? normalizeTelDigits(digitsOnly) : "";
}

function findDestinationByCode(code: string, destinations: DeliveryDestination[]) {
  const normalizedCode = normalizeCode(code);

  return (
    destinations.find((candidate) => normalizeCode(candidate.code) === normalizedCode) ?? null
  );
}

function findDestinationsByPostalCode(destinations: DeliveryDestination[], postalCode: string) {
  return destinations.filter(
    (candidate) => normalizePostalCode(candidate.postalCode) === postalCode,
  );
}

function matchDestinationByCenterName(
  centerName: string,
  destinations: DeliveryDestination[],
): { destination: DeliveryDestination | null; ambiguous: boolean } {
  const normalizedCenterName = normalizeCenterNameText(centerName);

  if (!normalizedCenterName) {
    return { destination: null, ambiguous: false };
  }

  const scored = destinations
    .map((destination) => ({
      destination,
      score: scoreCenterNameMatch(normalizedCenterName, destination),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    return { destination: null, ambiguous: false };
  }

  if (scored.length === 1 || scored[0].score >= scored[1].score + 8) {
    return { destination: scored[0].destination, ambiguous: false };
  }

  return { destination: null, ambiguous: true };
}

function scoreCenterNameMatch(normalizedCenterName: string, destination: DeliveryDestination) {
  const candidates = [destination.name, ...destination.aliases]
    .map((value) => normalizeCenterNameText(value))
    .filter(Boolean);
  let bestScore = 0;

  for (const candidate of candidates) {
    if (candidate === normalizedCenterName) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }

    if (
      candidate.length >= 8 &&
      (normalizedCenterName.includes(candidate) || candidate.includes(normalizedCenterName))
    ) {
      bestScore = Math.max(bestScore, 80);
      continue;
    }

    if (candidate.length >= 6 && normalizedCenterName.includes(candidate)) {
      bestScore = Math.max(bestScore, 60);
    }
  }

  return bestScore;
}

function normalizeCenterNameText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s/g, "")
    .replace(/[（）()]/g, "")
    .replace(/[・･]/g, "")
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .toLowerCase();
}

function pickBestDestinationMatch(
  candidates: DeliveryDestination[],
  searchText: string,
  tel?: string,
): { destination: DeliveryDestination | null; ambiguous: boolean } {
  if (candidates.length === 0) {
    return { destination: null, ambiguous: false };
  }

  if (candidates.length === 1) {
    return { destination: candidates[0], ambiguous: false };
  }

  if (hasSameAddressAndTelGroup(candidates)) {
    return { destination: null, ambiguous: true };
  }

  const scored = candidates
    .map((destination) => ({
      destination,
      score: scoreDeliveryDestinationAddressMatch(destination, searchText),
    }))
    .sort((left, right) => right.score - left.score);

  if (scored[0].score > 0 && scored[0].score > scored[1].score) {
    return { destination: scored[0].destination, ambiguous: false };
  }

  const normalizedTel = tel ? normalizeTelDigits(tel) : extractTel(searchText);

  if (normalizedTel) {
    const telMatches = candidates.filter(
      (candidate) => normalizeTelDigits(candidate.tel) === normalizedTel,
    );

    if (telMatches.length === 1) {
      return { destination: telMatches[0], ambiguous: false };
    }

    if (telMatches.length > 1) {
      const scoredTelMatches = telMatches
        .map((destination) => ({
          destination,
          score: scoreDeliveryDestinationAddressMatch(destination, searchText),
        }))
        .sort((left, right) => right.score - left.score);

      if (
        scoredTelMatches[0].score > 0 &&
        scoredTelMatches[0].score > scoredTelMatches[1].score
      ) {
        return { destination: scoredTelMatches[0].destination, ambiguous: false };
      }
    }
  }

  return { destination: null, ambiguous: true };
}

function hasSameAddressAndTelGroup(candidates: DeliveryDestination[]) {
  const groups = new Map<string, DeliveryDestination[]>();

  candidates.forEach((candidate) => {
    const key = [
      normalizeAddressText(candidate.address1),
      normalizeTelDigits(candidate.tel),
    ].join("::");
    const current = groups.get(key) ?? [];
    groups.set(key, [...current, candidate]);
  });

  return Array.from(groups.values()).some((group) => group.length > 1);
}

function scoreDeliveryDestinationAddressMatch(
  destination: DeliveryDestination,
  searchText: string,
) {
  const normalizedSearchText = normalizeAddressText(searchText);
  const destinationAddress = normalizeAddressText(
    [destination.address1, destination.address2, destination.address3].join(""),
  );
  let score = 0;

  if (destinationAddress && normalizedSearchText.includes(destinationAddress)) {
    score += 30;
  }

  const searchBlocks = extractAddressBlockNumbers(normalizedSearchText);
  const destinationBlocks = extractAddressBlockNumbers(destinationAddress);

  for (const block of searchBlocks) {
    if (destinationBlocks.includes(block)) {
      score += 15;
    }
  }

  for (const alias of destination.aliases) {
    const normalizedAlias = normalizeAddressText(alias);

    if (normalizedAlias.length >= 6 && normalizedSearchText.includes(normalizedAlias)) {
      score += 8;
    }
  }

  const normalizedName = normalizeAddressText(destination.name);

  if (normalizedName.length >= 4 && normalizedSearchText.includes(normalizedName)) {
    score += 5;
  }

  return score;
}

function normalizeAddressText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s/g, "")
    .replace(/[都道府県]/g, "")
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .toLowerCase();
}

function extractAddressBlockNumbers(value: string) {
  return [...new Set(value.match(/\d+(?:-\d+){1,2}/g) ?? [])];
}
