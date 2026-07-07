"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileUploadButton, UploadStatus } from "@/components/file-upload-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  resolveIntroductionProduct,
} from "@/lib/store-introduction-parsers";
import {
  getMatchedStoreNameForIntroduction,
  isLoftSeriesIntroductionSheet,
} from "@/lib/store-matching";
import { summarizeIntroducedStoresByChannel } from "@/lib/store-channel";
import { summarizeProductChainKpis } from "@/lib/store-introduction-kpi";
import {
  buildStoreIntroductionMatrix,
  type IntroductionMatrixProduct,
} from "@/lib/store-introduction-matrix";
import type { StoreLocationRecord } from "@/lib/store-location-groups";
import {
  importStoreIntroductionWorkbook,
  readStoreIntroductionData,
} from "@/lib/supabase/store-introduction-actions";
import type {
  Client,
  Product,
  Store,
  StoreIntroductionEntry,
  StoreIntroductionImport,
} from "@/lib/types";

export function StoreIntroductionPanel({
  clientId,
  initialDataClientId,
  clients,
  onClientChange,
  products,
  stores,
  storeLocations,
  initialImports,
  initialEntries,
}: {
  clientId: string;
  initialDataClientId?: string;
  clients: Client[];
  onClientChange: (clientId: string) => void;
  products: Product[];
  stores: Store[];
  storeLocations: StoreLocationRecord[];
  initialImports: StoreIntroductionImport[];
  initialEntries: StoreIntroductionEntry[];
}) {
  const [imports, setImports] = useState(initialImports);
  const [entries, setEntries] = useState(initialEntries);
  const [selectedProductKey, setSelectedProductKey] = useState("all");
  const [selectedRetailChainFilter, setSelectedRetailChainFilter] = useState("all");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [showIntroducedOnly, setShowIntroducedOnly] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const skipInitialServerLoadRef = useRef(true);

  useEffect(() => {
    if (!clientId) {
      setImports([]);
      setEntries([]);
      setSelectedRetailChainFilter("all");
      setIsLoading(false);
      return;
    }

    if (
      skipInitialServerLoadRef.current &&
      clientId === initialDataClientId &&
      initialDataClientId
    ) {
      skipInitialServerLoadRef.current = false;
      setImports(initialImports);
      setEntries(initialEntries);
      setIsLoading(false);
      return;
    }

    skipInitialServerLoadRef.current = false;

    let cancelled = false;

    async function loadIntroductionData() {
      setIsLoading(true);
      setNotice("");

      try {
        const data = await readStoreIntroductionData(clientId);

        if (cancelled) {
          return;
        }

        setImports(data.imports);
        setEntries(data.entries);
        setSelectedProductKey("all");
        setSelectedRetailChainFilter("all");
        setProductSearchQuery("");
      } catch (error) {
        if (!cancelled) {
          setNotice(
            error instanceof Error
              ? `導入店舗データの読み込みに失敗しました: ${error.message}`
              : "導入店舗データの読み込みに失敗しました。",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadIntroductionData();

    return () => {
      cancelled = true;
      setIsLoading(false);
    };
  }, [clientId, initialDataClientId]);

  function getResolvedProduct(entry: StoreIntroductionEntry) {
    return resolveIntroductionProduct(entry.jan, entry.productName, clientId, products);
  }

  function getEntryProductName(entry: StoreIntroductionEntry) {
    return getResolvedProduct(entry).productName;
  }

  function getEntryJan(entry: StoreIntroductionEntry) {
    return getResolvedProduct(entry).jan;
  }

  const activeImport = useMemo(
    () =>
      imports
        .slice()
        .sort((left, right) => right.importedAt.localeCompare(left.importedAt))[0],
    [imports],
  );
  const isLoftSeriesSheet = useMemo(() => {
    if (!activeImport) {
      return false;
    }

    const importEntries = entries.filter((entry) => entry.importId === activeImport.id);

    return isLoftSeriesIntroductionSheet(activeImport.formatKey, importEntries);
  }, [activeImport, entries]);

  function getEntryMatchedStoreName(entry: StoreIntroductionEntry) {
    if (!activeImport) {
      return entry.matchedStoreName;
    }

    return getMatchedStoreNameForIntroduction(
      entry,
      activeImport.formatKey,
      stores,
      isLoftSeriesSheet,
    );
  }

  function matchesProductSearch(entry: StoreIntroductionEntry) {
    const normalizedQuery = productSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    const jan = getEntryJan(entry).toLowerCase();
    const productName = getEntryProductName(entry).toLowerCase();
    const storedProductName = entry.productName.trim().toLowerCase();

    return [jan, productName, storedProductName].some((value) => value.includes(normalizedQuery));
  }

  function matchesRetailChainFilter(entry: StoreIntroductionEntry) {
    if (selectedRetailChainFilter === "all") {
      return true;
    }

    return getEntryMatchedStoreName(entry) === selectedRetailChainFilter;
  }

  const retailChainOptions = useMemo(() => {
    if (!activeImport) {
      return [] as string[];
    }

    const importEntries = entries.filter((entry) => entry.importId === activeImport.id);
    const chains = new Set<string>();

    importEntries.forEach((entry) => {
      const matchedName = getMatchedStoreNameForIntroduction(
        entry,
        activeImport.formatKey,
        stores,
        isLoftSeriesSheet,
      );

      if (matchedName && matchedName !== "店舗不明") {
        chains.add(matchedName);
      }
    });

    if (activeImport.chainName) {
      chains.add(activeImport.chainName);
    }

    return Array.from(chains).sort((left, right) => left.localeCompare(right, "ja"));
  }, [activeImport, entries, isLoftSeriesSheet, stores]);

  const effectiveRetailChainFilter = useMemo(() => {
    if (selectedRetailChainFilter !== "all") {
      return selectedRetailChainFilter;
    }

    if (isLoftSeriesSheet) {
      return "ロフト";
    }

    if (activeImport?.chainName) {
      return activeImport.chainName;
    }

    if (retailChainOptions.length === 1) {
      return retailChainOptions[0] ?? "all";
    }

    return "all";
  }, [activeImport?.chainName, isLoftSeriesSheet, retailChainOptions, selectedRetailChainFilter]);

  const productOptions = useMemo(() => {
    const optionMap = new Map<string, { key: string; jan: string; productName: string }>();

    entries
      .filter((entry) => entry.importId === activeImport?.id)
      .forEach((entry) => {
        const jan = getEntryJan(entry);
        const productName = getEntryProductName(entry);
        const key = `${jan}::${productName}`;

        if (!optionMap.has(key)) {
          optionMap.set(key, { key, jan, productName });
        }
      });

    return Array.from(optionMap.values()).sort((left, right) =>
      left.productName.localeCompare(right.productName, "ja"),
    );
  }, [activeImport?.id, clientId, entries, products]);

  const matrixProducts = useMemo(() => {
    let options = productOptions;

    if (selectedProductKey !== "all") {
      options = options.filter((option) => option.key === selectedProductKey);
    }

    if (productSearchQuery.trim()) {
      const normalizedQuery = productSearchQuery.trim().toLowerCase();
      options = options.filter(
        (option) =>
          option.jan.toLowerCase().includes(normalizedQuery) ||
          option.productName.toLowerCase().includes(normalizedQuery),
      );
    }

    return options.map(
      (option): IntroductionMatrixProduct => ({
        key: option.key,
        jan: option.jan,
        productName: option.productName,
      }),
    );
  }, [productOptions, productSearchQuery, selectedProductKey]);

  const introductionMatrix = useMemo(() => {
    if (!activeImport) {
      return { rows: [], products: [] as IntroductionMatrixProduct[] };
    }

    const importEntries = entries
      .filter((entry) => entry.importId === activeImport.id)
      .filter((entry) => matchesRetailChainFilter(entry))
      .map((entry) => ({
        storeCode: entry.storeCode,
        storeName: entry.storeName,
        address: entry.address,
        postalCode: entry.postalCode,
        jan: getEntryJan(entry),
        productName: getEntryProductName(entry),
        isIntroduced: entry.isIntroduced,
        chainName: getEntryMatchedStoreName(entry),
      }));

    return buildStoreIntroductionMatrix({
      chainFilter: effectiveRetailChainFilter,
      storeLocations,
      entries: importEntries,
      products: matrixProducts,
      showIntroducedOnly,
    });
  }, [
    activeImport,
    clientId,
    effectiveRetailChainFilter,
    entries,
    isLoftSeriesSheet,
    matrixProducts,
    productSearchQuery,
    products,
    showIntroducedOnly,
    storeLocations,
    stores,
  ]);

  const productChainKpis = useMemo(() => {
    if (!activeImport) {
      return [];
    }

    const importEntries = entries
      .filter((entry) => entry.importId === activeImport.id)
      .filter((entry) => matchesRetailChainFilter(entry))
      .map((entry) => ({
        jan: getEntryJan(entry),
        productName: getEntryProductName(entry),
        chainName: getEntryMatchedStoreName(entry),
        isIntroduced: entry.isIntroduced,
      }));

    return summarizeProductChainKpis(importEntries, activeImport.formatKey);
  }, [
    activeImport,
    clientId,
    entries,
    isLoftSeriesSheet,
    products,
    selectedRetailChainFilter,
    stores,
  ]);

  const selectedProductKpi = useMemo(() => {
    if (selectedProductKey === "all") {
      return null;
    }

    const matches = productChainKpis.filter(
      (kpi) => `${kpi.jan}::${kpi.productName}` === selectedProductKey,
    );

    if (selectedRetailChainFilter !== "all") {
      return matches.find((kpi) => kpi.chainName === selectedRetailChainFilter) ?? matches[0] ?? null;
    }

    return matches[0] ?? null;
  }, [productChainKpis, selectedProductKey, selectedRetailChainFilter]);

  const summary = useMemo(() => {
    const importEntries = entries.filter((entry) => entry.importId === activeImport?.id);
    const filtered = importEntries.filter((entry) => {
      if (selectedProductKey !== "all") {
        const jan = getEntryJan(entry);
        const productName = getEntryProductName(entry);
        if (`${jan}::${productName}` !== selectedProductKey) {
          return false;
        }
      }

      if (!matchesRetailChainFilter(entry)) {
        return false;
      }

      return matchesProductSearch(entry);
    });

    return summarizeIntroducedStoresByChannel(
      filtered.map((entry) => ({
        storeName: entry.storeName,
        matchedStoreName: getEntryMatchedStoreName(entry),
        isIntroduced: entry.isIntroduced,
      })),
    );
  }, [
    activeImport?.id,
    clientId,
    entries,
    isLoftSeriesSheet,
    products,
    productSearchQuery,
    selectedProductKey,
    selectedRetailChainFilter,
    stores,
  ]);

  async function handleFileChange(file: File | null) {
    if (!file || !clientId) {
      return;
    }

    setIsUploading(true);
    setNotice(`${file.name} を読み取っています...`);

    try {
      const formData = new FormData();
      formData.append("clientId", clientId);
      formData.append("file", file);
      formData.append("storesJson", JSON.stringify(stores));
      formData.append("productsJson", JSON.stringify(products));

      const result = await importStoreIntroductionWorkbook(formData);

      if (!result.ok) {
        setNotice(result.message);
        return;
      }

      setImports((current) => [result.importBatch, ...current.filter((item) => item.id !== result.importBatch.id)]);
      setEntries((current) => [
        ...result.entries,
        ...current.filter((entry) => entry.importId !== result.importBatch.id),
      ]);
      const firstEntry = result.entries[0];
      setSelectedProductKey(
        firstEntry ? `${firstEntry.jan}::${firstEntry.productName}` : "all",
      );
      setSelectedRetailChainFilter("all");
      setProductSearchQuery("");
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "導入店舗ファイルの取込に失敗しました。");
    } finally {
      setIsUploading(false);
      setFileInputKey((current) => current + 1);
    }
  }

  function getProductFilterLabel(option: { jan: string; productName: string }) {
    if (!option.productName || option.productName === option.jan) {
      return option.jan;
    }

    return `${option.productName} (${option.jan})`;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 pt-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(280px,1fr)]">
          <Field>
            <FieldLabel>クライアント</FieldLabel>
            <Select
              items={clients.map((client) => ({
                label: client.name,
                value: client.id,
              }))}
              value={clientId}
              onValueChange={(value) => onClientChange(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-col gap-2">
            <FieldLabel>導入店舗ファイル</FieldLabel>
            <FileUploadButton
              key={fileInputKey}
              accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isUploading || !clientId}
              fullWidth
              onFileChange={(file) => void handleFileChange(file)}
            />
            {isUploading ? <UploadStatus isProcessing message="読み取り中" /> : null}
          </div>
        </div>

        {notice && !isUploading ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        {!activeImport ? (
          <p className="border-t pt-6 text-base text-muted-foreground">
            {isLoading
              ? "導入店舗データを読み込んでいます..."
              : "まだ導入店舗データがありません。Excelをアップロードしてください。"}
          </p>
        ) : (
          <div className="grid gap-6 border-t pt-6">
            <div className="grid gap-3">
              <h3 className="text-base font-semibold">企業詳細</h3>
              <div className="grid grid-cols-2 gap-2.5">
              <FeaturedSummaryCard
                label={selectedProductKpi ? "導入店舗" : "導入店舗合計"}
                value={selectedProductKpi?.introducedCount ?? summary.introduced}
                unit="店舗"
              />
              <div className="grid grid-cols-2 gap-1">
                {selectedProductKpi?.hasFullStoreList ? (
                  <>
                    <SummaryCard label="全店舗" value={selectedProductKpi.totalStoreCount} />
                    <SummaryCard
                      label="導入率"
                      value={selectedProductKpi.penetrationRate ?? 0}
                      suffix="%"
                    />
                  </>
                ) : (
                  <>
                    <SummaryCard label="バラエティ" value={summary.variety} />
                    <SummaryCard label="ドラッグストア" value={summary.drugstore} />
                    <SummaryCard label="ディスカウント" value={summary.discount} />
                    <SummaryCard label="GMS" value={summary.gms} />
                    <SummaryCard label="CVS" value={summary.cvs} className="col-span-2" />
                  </>
                )}
              </div>
              </div>
            </div>

            {productChainKpis.length > 0 ? (
              <div className="grid gap-3">
                <h3 className="text-base font-semibold">チェーン別KPI</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <Table className="min-w-[820px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>小売企業</TableHead>
                        <TableHead>商品名</TableHead>
                        <TableHead>JAN</TableHead>
                        <TableHead>導入店舗</TableHead>
                        <TableHead>全店舗</TableHead>
                        <TableHead>導入率</TableHead>
                        <TableHead>拡大余地</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productChainKpis.map((kpi) => (
                        <TableRow key={`${kpi.chainName}-${kpi.jan}-${kpi.productName}`}>
                          <TableCell className="font-medium">{kpi.chainName}</TableCell>
                          <TableCell>{kpi.productName}</TableCell>
                          <TableCell className="font-mono text-xs">{kpi.jan}</TableCell>
                          <TableCell>{kpi.introducedCount.toLocaleString()}店</TableCell>
                          <TableCell>
                            {kpi.hasFullStoreList
                              ? `${kpi.totalStoreCount.toLocaleString()}店`
                              : "不明"}
                          </TableCell>
                          <TableCell>
                            {kpi.penetrationRate === null ? "-" : `${kpi.penetrationRate}%`}
                          </TableCell>
                          <TableCell>
                            {kpi.hasFullStoreList
                              ? `${Math.max(kpi.totalStoreCount - kpi.introducedCount, 0).toLocaleString()}店`
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3">
              <h3 className="text-base font-semibold">店舗詳細</h3>
              <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(220px,1fr)_auto]">
              <Field>
                <FieldLabel>小売企業</FieldLabel>
                <Select
                  value={selectedRetailChainFilter}
                  onValueChange={(value) => setSelectedRetailChainFilter(value ?? "all")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="小売企業" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべての小売企業</SelectItem>
                    {retailChainOptions.map((chainName) => (
                      <SelectItem key={chainName} value={chainName}>
                        {chainName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>商品</FieldLabel>
                <Select
                  value={selectedProductKey}
                  onValueChange={(value) => setSelectedProductKey(value ?? "all")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="商品" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべての商品</SelectItem>
                    {productOptions.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {getProductFilterLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>商品名 / JAN 検索</FieldLabel>
                <Input
                  value={productSearchQuery}
                  placeholder="商品名またはJANで絞り込み"
                  onChange={(event) => setProductSearchQuery(event.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  type="button"
                  className="w-full md:w-auto"
                  variant={showIntroducedOnly ? "default" : "outline"}
                  onClick={() => setShowIntroducedOnly((current) => !current)}
                >
                  {showIntroducedOnly ? "導入店のみ" : "全店舗表示"}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-background">店舗名</TableHead>
                    <TableHead className="min-w-[240px]">住所</TableHead>
                    {introductionMatrix.products.map((product) => (
                      <TableHead
                        key={product.key}
                        className="min-w-[120px]"
                        title={`${product.productName} (${product.jan})`}
                      >
                        {product.productName}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {introductionMatrix.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={2 + introductionMatrix.products.length}
                        className="py-8 text-center text-base text-muted-foreground"
                      >
                        表示対象の店舗がありません。
                      </TableCell>
                    </TableRow>
                  ) : (
                    introductionMatrix.rows.map((row) => (
                      <TableRow key={row.rowKey}>
                        <TableCell className="sticky left-0 z-10 bg-background font-medium">
                          {row.storeName}
                        </TableCell>
                        <TableCell>{row.address || "-"}</TableCell>
                        {introductionMatrix.products.map((product) => (
                          <TableCell key={product.key}>
                            {row.introducedByProduct[product.key] ? "◯" : "-"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeaturedSummaryCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex min-h-full flex-col justify-center rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-7 text-center">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-5xl font-bold tracking-tight text-primary md:text-6xl">
        {value.toLocaleString()}
      </p>
      <p className="mt-0.5 text-base font-medium text-muted-foreground">{unit}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  className,
  suffix = "店舗",
}: {
  label: string;
  value: number;
  className?: string;
  suffix?: string;
}) {
  return (
    <div className={`rounded-lg border bg-muted/30 px-3 py-2 ${className ?? ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold leading-tight">
        {value.toLocaleString()}
        {suffix}
      </p>
    </div>
  );
}
