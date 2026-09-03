export type SelloutProductCatalogEntry = {
  jan: string;
  clientId: string;
  clientName: string;
};

const MAX_LISTED_JANS = 8;

export function evaluateSelloutClientGuard(input: {
  selectedClientId: string;
  selectedClientName: string;
  jans: string[];
  catalog: SelloutProductCatalogEntry[];
}): { ok: true } | { ok: false; message: string } {
  const uniqueJans = uniqueJansFrom(input.jans);
  if (uniqueJans.length === 0) {
    return {
      ok: false,
      message: "このファイルにJANがありません。商品マスタと照合できないため、取り込みません。",
    };
  }

  const ownersByJan = new Map<string, SelloutProductCatalogEntry[]>();
  for (const item of input.catalog) {
    const jan = item.jan.trim();
    if (!jan) {
      continue;
    }
    const current = ownersByJan.get(jan) ?? [];
    current.push(item);
    ownersByJan.set(jan, current);
  }

  const unknownJans: string[] = [];
  const otherClientNames = new Set<string>();

  for (const jan of uniqueJans) {
    const owners = ownersByJan.get(jan) ?? [];
    const onSelected = owners.some((owner) => owner.clientId === input.selectedClientId);
    if (onSelected) {
      continue;
    }

    if (owners.length === 0) {
      unknownJans.push(jan);
      continue;
    }

    for (const owner of owners) {
      if (owner.clientId !== input.selectedClientId && owner.clientName) {
        otherClientNames.add(owner.clientName);
      }
    }
  }

  if (otherClientNames.size > 0 && unknownJans.length > 0) {
    return {
      ok: false,
      message: `このファイルには、${input.selectedClientName}以外の商品と、商品マスタにないJANが混ざっています。先に商品マスタを直してから、正しいクライアントで上げてください。`,
    };
  }

  if (otherClientNames.size > 0) {
    const otherName = [...otherClientNames].join(" / ");
    return {
      ok: false,
      message: `このファイルのJANは${otherName}の商品です。クライアントを${otherName}に切り替えてから上げてください。`,
    };
  }

  if (unknownJans.length > 0) {
    return {
      ok: false,
      message: `先に${input.selectedClientName}の商品マスタへ、このJANを登録してください: ${formatJanList(unknownJans)}`,
    };
  }

  return { ok: true };
}

function uniqueJansFrom(jans: string[]) {
  return [...new Set(jans.map((jan) => jan.trim()).filter(Boolean))];
}

function formatJanList(jans: string[]) {
  const shown = jans.slice(0, MAX_LISTED_JANS);
  const rest = jans.length - shown.length;
  return rest > 0 ? `${shown.join("、")}、ほか${rest}件` : shown.join("、");
}
