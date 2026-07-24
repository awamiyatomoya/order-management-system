"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
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
  resolveIntroductionDisplayProduct,
} from "@/lib/store-introduction-parsers";
import {
  getMatchedStoreNameForIntroduction,
  isHandsSeriesIntroductionSheet,
  isLoftSeriesIntroductionSheet,
} from "@/lib/store-matching";
import { summarizeIntroducedStoresByChannel } from "@/lib/store-channel";
import {
  summarizeProductChainKpis,
  enrichProductChainKpisWithStoreMaster,
  aggregateProductChainKpis,
  shouldShowProductChainKpi,
  resolveIntroductionFormatKey,
  sumUniqueChainTotalStores,
} from "@/lib/store-introduction-kpi";
import {
  buildStoreIntroductionMatrix,
  type IntroductionMatrixProduct,
} from "@/lib/store-introduction-matrix";
import {
  buildStoreIntroductionExportFileName,
  buildStoreIntroductionExportRows,
} from "@/lib/store-introduction-export";
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
  onStoreLocationsRefresh,
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
  onStoreLocationsRefresh?: () => Promise<void>;
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

  function getEntryDisplayProduct(entry: StoreIntroductionEntry) {
    return resolveIntroductionDisplayProduct(entry.jan, entry.productName, clientId, products);
  }

  function getEntryProductName(entry: StoreIntroductionEntry) {
    return getEntryDisplayProduct(entry).productName;
  }

  function getEntryJan(entry: StoreIntroductionEntry) {
    return getEntryDisplayProduct(entry).jan;
  }

  function getEntryProductKey(entry: StoreIntroductionEntry) {
    return getEntryDisplayProduct(entry).productKey;
  }

  const activeImport = useMemo(
    () =>
      imports
        .slice()
        .sort((left, right) => right.importedAt.localeCompare(left.importedAt))[0],
    [imports],
  );

  const latestImportIdByChain = useMemo(() => {
    const map = new Map<string, string>();

    imports
      .slice()
      .sort((left, right) => right.importedAt.localeCompare(left.importedAt))
      .forEach((importBatch) => {
        const chainName = importBatch.chainName.trim();
        if (chainName && !map.has(chainName)) {
          map.set(chainName, importBatch.id);
        }
      });

    return map;
  }, [imports]);

  const latestEntriesPerChain = useMemo(() => {
    return entries.filter((entry) => {
      const importBatch = imports.find((item) => item.id === entry.importId);
      if (!importBatch) {
        return false;
      }

      const flags = getImportSheetFlags(importBatch);
      const chainName = getMatchedStoreNameForIntroduction(
        entry,
        importBatch.formatKey,
        stores,
        flags.isLoftSeriesSheet,
        flags.isHandsSeriesSheet,
      );
      const latestImportId = latestImportIdByChain.get(chainName);
      return latestImportId ? entry.importId === latestImportId : false;
    });
  }, [entries, imports, latestImportIdByChain, stores]);

  function getImportSheetFlags(importBatch: StoreIntroductionImport | undefined) {
    if (!importBatch) {
      return { isLoftSeriesSheet: false, isHandsSeriesSheet: false };
    }

    const importEntries = entries.filter((entry) => entry.importId === importBatch.id);

    return {
      isLoftSeriesSheet: isLoftSeriesIntroductionSheet(importBatch.formatKey, importEntries),
      isHandsSeriesSheet: isHandsSeriesIntroductionSheet(importBatch.formatKey, importEntries),
    };
  }

  function getEntryMatchedStoreName(entry: StoreIntroductionEntry) {
    const importBatch = imports.find((item) => item.id === entry.importId);
    if (!importBatch) {
      return entry.matchedStoreName;
    }

    const flags = getImportSheetFlags(importBatch);

    return getMatchedStoreNameForIntroduction(
      entry,
      importBatch.formatKey,
      stores,
      flags.isLoftSeriesSheet,
      flags.isHandsSeriesSheet,
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
    const chains = new Set<string>();

    imports.forEach((importBatch) => {
      const flags = getImportSheetFlags(importBatch);
      entries
        .filter((entry) => entry.importId === importBatch.id)
        .forEach((entry) => {
          const matchedName = getMatchedStoreNameForIntroduction(
            entry,
            importBatch.formatKey,
            stores,
            flags.isLoftSeriesSheet,
            flags.isHandsSeriesSheet,
          );

          if (matchedName && matchedName !== "店舗不明") {
            chains.add(matchedName);
          }
        });

      if (importBatch.chainName) {
        chains.add(importBatch.chainName);
      }
    });

    return Array.from(chains).sort((left, right) => left.localeCompare(right, "ja"));
  }, [entries, imports, stores]);

  const productOptions = useMemo(() => {
    const optionMap = new Map<string, { key: string; jan: string; productName: string }>();

    entries.forEach((entry) => {
      const displayProduct = getEntryDisplayProduct(entry);
      const key = displayProduct.productKey;

      if (!optionMap.has(key)) {
        optionMap.set(key, {
          key,
          jan: displayProduct.jan,
          productName: displayProduct.productName,
        });
      }
    });

    return Array.from(optionMap.values()).sort((left, right) =>
      left.productName.localeCompare(right.productName, "ja"),
    );
  }, [clientId, entries, products]);

  const matrixProductOptions = useMemo(() => {
    const optionMap = new Map<string, { key: string; jan: string; productName: string }>();

    latestEntriesPerChain.forEach((entry) => {
      const chainName = getEntryMatchedStoreName(entry);
      if (selectedRetailChainFilter !== "all" && chainName !== selectedRetailChainFilter) {
        return;
      }

      const displayProduct = getEntryDisplayProduct(entry);
      const key = displayProduct.productKey;

      if (!optionMap.has(key)) {
        optionMap.set(key, {
          key,
          jan: displayProduct.jan,
          productName: displayProduct.productName,
        });
      }
    });

    return Array.from(optionMap.values()).sort((left, right) =>
      left.productName.localeCompare(right.productName, "ja"),
    );
  }, [latestEntriesPerChain, products, selectedRetailChainFilter]);

  const matrixProducts = useMemo(() => {
    let options = matrixProductOptions;

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
  }, [matrixProductOptions, productSearchQuery, selectedProductKey]);

  const introductionMatrix = useMemo(() => {
    const importEntries = latestEntriesPerChain
      .filter((entry) => matchesRetailChainFilter(entry))
      .map((entry) => {
        const displayProduct = getEntryDisplayProduct(entry);

        return {
          storeCode: entry.storeCode,
          storeName: entry.storeName,
          address: entry.address,
          postalCode: entry.postalCode,
          jan: displayProduct.jan,
          productName: displayProduct.productName,
          productKey: displayProduct.productKey,
          isIntroduced: entry.isIntroduced,
          chainName: getEntryMatchedStoreName(entry),
        };
      });

    return buildStoreIntroductionMatrix({
      chainFilter: selectedRetailChainFilter,
      storeLocations,
      entries: importEntries,
      products: matrixProducts,
      showIntroducedOnly,
    });
  }, [
    latestEntriesPerChain,
    matrixProducts,
    selectedRetailChainFilter,
    showIntroducedOnly,
    storeLocations,
  ]);

  const productChainKpis = useMemo(() => {
    if (imports.length === 0) {
      return [];
    }

    return Array.from(latestImportIdByChain.entries())
      .flatMap(([chainName, importId]) => {
        const importBatch = imports.find((item) => item.id === importId);
        if (!importBatch) {
          return [];
        }

        if (
          selectedRetailChainFilter !== "all" &&
          selectedRetailChainFilter !== chainName
        ) {
          return [];
        }

        const importEntries = entries
          .filter((entry) => entry.importId === importBatch.id)
          .map((entry) => ({
            jan: getEntryJan(entry),
            productName: getEntryProductName(entry),
            productKey: getEntryProductKey(entry),
            chainName: getEntryMatchedStoreName(entry),
            isIntroduced: entry.isIntroduced,
          }));

        return enrichProductChainKpisWithStoreMaster(
          summarizeProductChainKpis(
            importEntries,
            resolveIntroductionFormatKey(importBatch.formatKey, importBatch.fileName),
          ).map((kpi) => ({
            ...kpi,
            fileName: importBatch.fileName,
            importedAt: importBatch.importedAt,
          })),
          storeLocations,
        );
      })
      .filter(shouldShowProductChainKpi)
      .sort((left, right) => {
        const chainCompare = left.chainName.localeCompare(right.chainName, "ja");
        if (chainCompare !== 0) {
          return chainCompare;
        }

        return left.productName.localeCompare(right.productName, "ja");
      });
  }, [
    entries,
    imports,
    latestImportIdByChain,
    products,
    selectedRetailChainFilter,
    storeLocations,
    stores,
  ]);

  const companyDetailKpi = useMemo(() => {
    if (selectedProductKey === "all") {
      return null;
    }

    const matches = productChainKpis.filter((kpi) => kpi.productKey === selectedProductKey);

    if (selectedRetailChainFilter !== "all") {
      return matches.find((kpi) => kpi.chainName === selectedRetailChainFilter) ?? null;
    }

    return aggregateProductChainKpis(matches);
  }, [productChainKpis, selectedProductKey, selectedRetailChainFilter]);

  const isMultiChainProductView =
    selectedProductKey !== "all" &&
    selectedRetailChainFilter === "all" &&
    productChainKpis.filter((kpi) => kpi.productKey === selectedProductKey).length > 1;

  const summary = useMemo(() => {
    const filtered = latestEntriesPerChain.filter((entry) => {
      if (selectedProductKey !== "all") {
        if (getEntryProductKey(entry) !== selectedProductKey) {
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
        storeCode: entry.storeCode,
        matchedStoreName: getEntryMatchedStoreName(entry),
        isIntroduced: entry.isIntroduced,
      })),
    );
  }, [
    latestEntriesPerChain,
    products,
    productSearchQuery,
    selectedProductKey,
    selectedRetailChainFilter,
    stores,
  ]);

  const scopedProductChainKpis = useMemo(() => {
    return productChainKpis.filter((kpi) => {
      if (selectedProductKey !== "all" && kpi.productKey !== selectedProductKey) {
        return false;
      }

      if (selectedRetailChainFilter !== "all" && kpi.chainName !== selectedRetailChainFilter) {
        return false;
      }

      return true;
    });
  }, [productChainKpis, selectedProductKey, selectedRetailChainFilter]);

  const companyOverview = useMemo(() => {
    const introducedCount =
      selectedProductKey === "all"
        ? summary.introduced
        : scopedProductChainKpis.reduce((sum, kpi) => sum + kpi.introducedCount, 0);
    const totalStoreCount = sumUniqueChainTotalStores(scopedProductChainKpis);

    return {
      introducedCount,
      totalStoreCount,
      penetrationRate:
        totalStoreCount > 0
          ? Math.round((introducedCount / totalStoreCount) * 1000) / 10
          : null,
    };
  }, [scopedProductChainKpis, selectedProductKey, summary.introduced]);

  const showChannelBreakdown =
    selectedRetailChainFilter === "all" ||
    !companyDetailKpi?.hasFullStoreList;

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
        firstEntry
          ? resolveIntroductionDisplayProduct(
              firstEntry.jan,
              firstEntry.productName,
              clientId,
              products,
            ).productKey
          : "all",
      );
      setSelectedRetailChainFilter("all");
      setProductSearchQuery("");
      setNotice(result.message);
      await onStoreLocationsRefresh?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "導入店舗ファイルの取込に失敗しました。";
      setNotice(
        message.includes("unexpected response")
          ? "サーバーから不正な応答がありました。ファイルサイズが大きい場合は時間をおいて再試行するか、管理者に連絡してください。"
          : message,
      );
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

  function exportIntroductionMatrixExcel() {
    if (introductionMatrix.rows.length === 0) {
      setNotice("出力対象の店舗がありません。");
      return;
    }

    const selectedProduct = productOptions.find((option) => option.key === selectedProductKey);
    const worksheet = XLSX.utils.json_to_sheet(
      buildStoreIntroductionExportRows(introductionMatrix.rows, introductionMatrix.products),
    );
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "導入店舗表");
    XLSX.writeFile(
      workbook,
      buildStoreIntroductionExportFileName({
        chainFilter: selectedRetailChainFilter,
        productLabel: selectedProduct ? selectedProduct.productName : undefined,
      }),
    );
    setNotice(`導入店舗表Excelを出力しました（${introductionMatrix.rows.length.toLocaleString()}店舗）。`);
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
              accept=".xlsx,.xls,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
              disabled={isUploading || !clientId}
              fullWidth
              label="導入店舗ファイルをアップロード"
              description="Excelファイル（.xlsx / .xls / .xlsm）を選択できます。"
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
                introducedLabel={
                  selectedProductKey !== "all"
                    ? isMultiChainProductView
                      ? "導入店舗（全チェーン合計）"
                      : "導入店舗"
                    : "導入店舗合計"
                }
                totalLabel={
                  selectedRetailChainFilter === "all" ? "全導入企業店舗数" : "全店舗"
                }
                introduced={companyOverview.introducedCount}
                totalStores={companyOverview.totalStoreCount}
                penetrationRate={companyOverview.penetrationRate}
              />
              <div className="grid grid-cols-2 gap-1">
                {showChannelBreakdown ? (
                  <>
                    <SummaryCard label="バラエティ" value={summary.variety} />
                    <SummaryCard label="ドラッグストア" value={summary.drugstore} />
                    <SummaryCard label="ディスカウント" value={summary.discount} />
                    <SummaryCard label="GMS" value={summary.gms} />
                    <SummaryCard label="CVS" value={summary.cvs} className="col-span-2" />
                  </>
                ) : (
                  <>
                    <SummaryCard label="全店舗" value={companyDetailKpi?.totalStoreCount ?? 0} />
                    <SummaryCard
                      label="導入率"
                      value={companyDetailKpi?.penetrationRate ?? 0}
                      suffix="%"
                    />
                  </>
                )}
              </div>
              </div>
            </div>

            {productChainKpis.length > 0 ? (
              <div className="grid gap-3">
                <h3 className="text-base font-semibold">チェーン別KPI</h3>
                <p className="text-sm text-muted-foreground">
                  全小売チェーン共通: 店舗マスタ（全店舗）は公式サイト基準、導入店舗数は取込Excelから集計します。全店舗合計はチェーンごとの店舗数を合算しています。
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <Table className="min-w-[820px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>小売企業</TableHead>
                        <TableHead className="text-left">商品名</TableHead>
                        <TableHead>JAN</TableHead>
                        <TableHead>取込ファイル</TableHead>
                        <TableHead>導入店舗</TableHead>
                        <TableHead>全店舗</TableHead>
                        <TableHead>導入率</TableHead>
                        <TableHead>拡大余地</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productChainKpis.map((kpi) => (
                        <TableRow key={`${kpi.chainName}-${kpi.jan}-${kpi.productName}-${kpi.fileName}`}>
                          <TableCell className="font-medium">{kpi.chainName}</TableCell>
                          <TableCell className="text-left">{kpi.productName}</TableCell>
                          <TableCell className="font-mono text-xs">{kpi.jan}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs" title={kpi.fileName}>
                            {kpi.fileName || "-"}
                          </TableCell>
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">店舗詳細</h3>
                <Button
                  type="button"
                  variant="outline"
                  disabled={introductionMatrix.rows.length === 0}
                  onClick={exportIntroductionMatrixExcel}
                >
                  Excel出力
                </Button>
              </div>
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
                    <TableHead className="sticky left-0 z-10 w-12 min-w-12 bg-background text-center">No.</TableHead>
                    <TableHead className="sticky left-12 z-10 min-w-[96px] bg-background">小売企業</TableHead>
                    <TableHead className="sticky left-[144px] z-10 bg-background">店舗名</TableHead>
                    <TableHead className="min-w-[240px]">住所</TableHead>
                    {introductionMatrix.products.map((product) => (
                      <TableHead
                        key={product.key}
                        className="min-w-[120px] text-left"
                        title={`${product.productName} (${product.jan})`}
                      >
                        <span className="line-clamp-2">{product.productName}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {introductionMatrix.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4 + introductionMatrix.products.length}
                        className="py-8 text-center text-base text-muted-foreground"
                      >
                        表示対象の店舗がありません。
                      </TableCell>
                    </TableRow>
                  ) : (
                    introductionMatrix.rows.map((row, index) => (
                      <TableRow key={`${row.chainName}-${row.rowKey}`}>
                        <TableCell className="sticky left-0 z-10 bg-background text-center text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="sticky left-12 z-10 bg-background font-medium">
                          {row.chainName || "-"}
                        </TableCell>
                        <TableCell className="sticky left-[144px] z-10 bg-background font-medium">
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
  introducedLabel,
  totalLabel,
  introduced,
  totalStores,
  penetrationRate,
}: {
  introducedLabel: string;
  totalLabel: string;
  introduced: number;
  totalStores: number;
  penetrationRate: number | null;
}) {
  const labelClass =
    "text-[11px] font-medium leading-none tracking-wide text-muted-foreground";

  return (
    <div className="flex min-h-full items-center justify-center gap-8 rounded-xl border-2 border-primary/30 bg-primary/5 px-8 py-7 md:gap-10 md:px-10">
      <div className="flex items-end gap-1.5 md:gap-2">
        <div className="flex flex-col items-start pl-1.5">
          <p className={`mb-3 min-h-3 ${labelClass}`}>{introducedLabel}</p>
          <p className="tabular-nums text-[2.75rem] font-bold leading-none tracking-tight text-primary md:text-[3.5rem]">
            {introduced.toLocaleString()}
          </p>
        </div>
        {totalStores > 0 ? (
          <>
            <span className="mb-1 text-xl font-light text-muted-foreground/40 md:mb-1.5 md:text-2xl">
              /
            </span>
            <div className="flex flex-col items-start">
              <p className={`mb-3 min-h-3 ${labelClass}`}>{totalLabel}</p>
              <div className="flex items-baseline gap-1">
                <p className="tabular-nums text-2xl font-semibold leading-none tracking-tight text-muted-foreground md:text-3xl">
                  {totalStores.toLocaleString()}
                </p>
                <span className="text-xs font-medium text-muted-foreground/80 md:text-sm">店舗</span>
              </div>
            </div>
          </>
        ) : null}
      </div>
      {penetrationRate !== null ? (
        <div className="flex flex-col items-start border-l border-primary/15 pl-8 md:pl-10">
          <p className={`mb-3 min-h-3 ${labelClass}`}>導入率</p>
          <p className="tabular-nums text-2xl font-bold leading-none tracking-tight text-foreground md:text-3xl">
            {penetrationRate}%
          </p>
        </div>
      ) : null}
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
