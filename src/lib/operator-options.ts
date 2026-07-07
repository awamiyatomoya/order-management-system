export const MAX_OPERATOR_NAME_LENGTH = 50;

export function normalizeOperatorName(value: string | null | undefined) {
  const trimmed = value?.trim().normalize("NFKC") ?? "";

  if (!trimmed || trimmed.length > MAX_OPERATOR_NAME_LENGTH) {
    return "";
  }

  return trimmed;
}

export function validateOperatorName(value: string | null | undefined) {
  const operatorName = normalizeOperatorName(value);

  if (!operatorName) {
    return {
      ok: false as const,
      message: "担当者名を入力してください。",
    };
  }

  return {
    ok: true as const,
    operatorName,
  };
}
