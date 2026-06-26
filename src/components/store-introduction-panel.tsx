"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileUploadButton, UploadStatus } from "@/components/file-upload-button";
import { Field, FieldLabel } from "@/components/ui/field";
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
  clients,
  onClientChange,
  products,
  stores,
  initialImports,
  initialEntries,
}: {
  clientId: string;
  clients: Client[];
  onClientChange: (clientId: string) => void;
  products: Product[];
  stores: Store[];
  initialImports: StoreIntroductionImport[];
  initialEntries: StoreIntroductionEntry[];
}) {
  const [imports, setImports] = useState(initialImports);
  const [entries, setEntries] = useState(initialEntries);
  const [selectedImportId, setSelectedImportId] = useState(initialImports[0]?.id ?? "");
  const [selectedJan, setSelectedJan] = useState("all");
  const [showIntroducedOnly, setShowIntroducedOnly] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    if (!clientId) {
      setImports([]);
      setEntries([]);
      setSelectedImportId("");
      return;
    }

    let cancelled = false;

    async function loadIntroductionData() {
      setIsLoading(true);

      try {
        const data = await readStoreIntroductionData(clientId);

        if (cancelled) {
          return;
        }

        setImports(data.imports);
        setEntries(data.entries);
        setSelectedImportId(data.imports[0]?.id ?? "");
        setSelectedJan("all");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadIntroductionData();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  function getResolvedProduct(entry: StoreIntroductionEntry) {
    return resolveIntroductionProduct(entry.jan, entry.productName, clientId, products);
  }

  function getEntryProductName(entry: StoreIntroductionEntry) {
    return getResolvedProduct(entry).productName;
  }

  function getEntryJan(entry: StoreIntroductionEntry) {
    return getResolvedProduct(entry).jan;
  }

  const activeImport = imports.find((item) => item.id === selectedImportId) ?? imports[0];
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

  const showAddressColumn = useMemo(() => {
    const importEntries = entries.filter((entry) => entry.importId === activeImport?.id);
    return importEntries.some((entry) => entry.address.trim());
  }, [activeImport?.id, entries]);
  const visibleEntries = useMemo(() => {
    const importEntries = entries.filter((entry) => entry.importId === activeImport?.id);

    return importEntries.filter((entry) => {
      if (selectedJan !== "all" && getEntryJan(entry) !== selectedJan) {
        return false;
      }

      if (showIntroducedOnly && !entry.isIntroduced) {
        return false;
      }

      return true;
    });
  }, [activeImport?.id, clientId, entries, products, selectedJan, showIntroducedOnly]);

  const janOptions = useMemo(() => {
    const jans = Array.from(
      new Set(
        entries
          .filter((entry) => entry.importId === activeImport?.id)
          .map((entry) => getEntryJan(entry)),
      ),
    );

    return jans.sort();
  }, [activeImport?.id, clientId, entries, products]);

  const summary = useMemo(() => {
    const importEntries = entries.filter((entry) => entry.importId === activeImport?.id);
    const filtered =
      selectedJan === "all" ? importEntries : importEntries.filter((entry) => getEntryJan(entry) === selectedJan);

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
    selectedJan,
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
      setSelectedImportId(result.importBatch.id);
      setSelectedJan(result.entries[0]?.jan ?? "all");
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "導入店舗ファイルの取込に失敗しました。");
    } finally {
      setIsUploading(false);
      setFileInputKey((current) => current + 1);
    }
  }

  function getJanFilterLabel(jan: string) {
    const entry = entries.find((item) => item.importId === activeImport?.id && getEntryJan(item) === jan);
    if (!entry) {
      return jan;
    }

    const productName = getEntryProductName(entry);
    return productName === jan ? jan : `${productName} (${jan})`;
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
            <div className="grid grid-cols-2 gap-4">
              <FeaturedSummaryCard label="全店舗" value={summary.introduced} unit="店舗" />
              <div className="grid grid-cols-2 gap-2">
                <SummaryCard label="バラエティ" value={summary.variety} />
                <SummaryCard label="ドラッグストア" value={summary.drugstore} />
                <SummaryCard label="ディスカウント" value={summary.discount} />
                <SummaryCard label="GMS" value={summary.gms} />
                <SummaryCard label="CVS" value={summary.cvs} className="col-span-2" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(180px,1fr)_auto]">
              <Field>
                <FieldLabel>取込履歴</FieldLabel>
                <Select
                  value={selectedImportId}
                  onValueChange={(value) => setSelectedImportId(value ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="取込履歴" />
                  </SelectTrigger>
                  <SelectContent>
                    {imports.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.fileName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>JAN</FieldLabel>
                <Select value={selectedJan} onValueChange={(value) => setSelectedJan(value ?? "all")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="JAN" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべてのJAN</SelectItem>
                    {janOptions.map((jan) => (
                      <SelectItem key={jan} value={jan}>
                        {getJanFilterLabel(jan)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <p className="text-sm text-muted-foreground">
              ファイル: {activeImport.fileName} / 取込日時:{" "}
              {new Date(activeImport.importedAt).toLocaleString("ja-JP")}
            </p>

            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-sm">JAN</TableHead>
                    <TableHead className="text-sm">商品名</TableHead>
                    <TableHead className="text-base">店舗名</TableHead>
                    <TableHead className="text-sm">マスタ照合</TableHead>
                    {showAddressColumn ? <TableHead className="text-sm">住所</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEntries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={showAddressColumn ? 5 : 4}
                        className="py-8 text-center text-base text-muted-foreground"
                      >
                        表示対象の店舗がありません。
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleEntries.map((entry) => {
                      const matchedStoreName = getEntryMatchedStoreName(entry);

                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-sm">{getEntryJan(entry)}</TableCell>
                          <TableCell className="text-sm">{getEntryProductName(entry)}</TableCell>
                          <TableCell className="text-base font-medium">{entry.storeName}</TableCell>
                          <TableCell className="text-sm">
                            {matchedStoreName === "店舗不明" ? "-" : matchedStoreName}
                          </TableCell>
                          {showAddressColumn ? (
                            <TableCell className="text-sm">{entry.address}</TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
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
    <div className="flex min-h-full flex-col justify-center rounded-xl border-2 border-primary/30 bg-primary/5 px-8 py-10 text-center">
      <p className="text-base font-medium text-muted-foreground">{label}</p>
      <p className="mt-4 text-6xl font-bold tracking-tight text-primary md:text-7xl">
        {value.toLocaleString()}
      </p>
      <p className="mt-2 text-lg font-medium text-muted-foreground">{unit}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border bg-muted/30 px-4 py-4 ${className ?? ""}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString()}店舗</p>
    </div>
  );
}
