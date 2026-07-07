export function calculatePayoutRateFromPrices(
  wholesalePrice: number | null | undefined,
  retailPrice: number | null | undefined,
): number | null {
  if (wholesalePrice == null || retailPrice == null) {
    return null;
  }

  if (!Number.isFinite(wholesalePrice) || !Number.isFinite(retailPrice)) {
    return null;
  }

  if (wholesalePrice <= 0 || retailPrice <= 0) {
    return null;
  }

  return wholesalePrice / retailPrice;
}

export function resolveProductPayoutRate(product: {
  wholesalePrice: number;
  retailPrice?: number | null;
  payoutRate?: number | null;
}): number | null {
  return calculatePayoutRateFromPrices(product.wholesalePrice, product.retailPrice);
}

export function isValidPayoutRate(
  payoutRate: number | null,
  fbpFeeRate: number,
): payoutRate is number {
  return payoutRate !== null && payoutRate > fbpFeeRate;
}
