import type {
  IntroductionMatrixProduct,
  IntroductionMatrixRow,
} from "@/lib/store-introduction-matrix";

export function buildStoreIntroductionExportRows(
  rows: IntroductionMatrixRow[],
  products: IntroductionMatrixProduct[],
): Record<string, string | number>[] {
  return rows.map((row, index) => {
    const exportRow: Record<string, string | number> = {
      "No.": index + 1,
      小売企業: row.chainName || "-",
      店舗名: row.storeName,
      住所: row.address || "-",
    };

    products.forEach((product) => {
      const columnName = resolveProductColumnName(product, products);
      exportRow[columnName] = row.introducedByProduct[product.key] ? "◯" : "-";
    });

    return exportRow;
  });
}

export function buildStoreIntroductionExportFileName({
  chainFilter,
  productLabel,
  exportedAt = new Date(),
}: {
  chainFilter?: string;
  productLabel?: string;
  exportedAt?: Date;
} = {}) {
  const date = exportedAt.toISOString().slice(0, 10);
  const parts = ["導入店舗表"];

  if (chainFilter && chainFilter !== "all") {
    parts.push(sanitizeFileNamePart(chainFilter));
  }

  if (productLabel) {
    parts.push(sanitizeFileNamePart(productLabel));
  }

  parts.push(date);

  return `${parts.join("_")}.xlsx`;
}

function resolveProductColumnName(
  product: IntroductionMatrixProduct,
  products: IntroductionMatrixProduct[],
) {
  const duplicateNameCount = products.filter(
    (item) => item.productName === product.productName,
  ).length;

  if (duplicateNameCount <= 1) {
    return product.productName;
  }

  return `${product.productName} (${product.jan})`;
}

function sanitizeFileNamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "untitled";
}
