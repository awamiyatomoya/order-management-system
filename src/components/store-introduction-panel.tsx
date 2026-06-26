"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileUploadButton, UploadStatus } from "@/components/file-upload-button";
import { FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
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
  importStoreIntroductionWorkbook,
  readStoreIntroductionData,
} from "@/lib/supabase/store-introduction-actions";
import type {
  Product,
  Store,
  StoreIntroductionEntry,
  StoreIntroductionImport,
} from "@/lib/types";

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StoreIntroductionPanel({
  clientId,
  products,
  stores,
  initialImports,
  initialEntries,
}: {
  clientId: string;
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

  const activeImport = imports.find((item) => item.id === selectedImportId) ?? imports[0];
  const visibleEntries = useMemo(() => {
    const importEntries = entries.filter((entry) => entry.importId === activeImport?.id);

    return importEntries.filter((entry) => {
      if (selectedJan !== "all" && entry.jan !== selectedJan) {
        return false;
      }

      if (showIntroducedOnly && !entry.isIntroduced) {
        return false;
      }

      return true;
    });
  }, [activeImport?.id, entries, selectedJan, showIntroducedOnly]);

  const janOptions = useMemo(() => {
    const jans = Array.from(
      new Set(entries.filter((entry) => entry.importId === activeImport?.id).map((entry) => entry.jan)),
    );

    return jans.sort();
  }, [activeImport?.id, entries]);

  const summary = useMemo(() => {
    const importEntries = entries.filter((entry) => entry.importId === activeImport?.id);
    const filtered =
      selectedJan === "all" ? importEntries : importEntries.filter((entry) => entry.jan === selectedJan);

    return {
      total: filtered.length,
      introduced: filtered.filter((entry) => entry.isIntroduced).length,
    };
  }, [activeImport?.id, entries, selectedJan]);

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

  function getProductLabel(jan: string) {
    const product = products.find((item) => item.clientId === clientId && item.jan === jan);
    return product ? `${product.name} (${jan})` : jan;
  }

  return (
    <section className="grid gap-4">
      <Panel title="導入店舗取込">
        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <FieldLabel>導入店舗ファイル</FieldLabel>
            <FileUploadButton
              key={fileInputKey}
              accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isUploading || !clientId}
              fullWidth
              label="導入店舗ファイルをアップロード"
              description="Excelファイルを選択できます。店舗一覧表・0/1フラグ表に対応しています。"
              onFileChange={(file) => void handleFileChange(file)}
            />
            {isUploading ? <UploadStatus isProcessing message="読み取り中" /> : null}
          </div>
          {notice && !isUploading ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        </div>
      </Panel>

      <Panel
        title="導入店舗一覧"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedImportId}
              onValueChange={(value) => setSelectedImportId(value ?? "")}
            >
              <SelectTrigger className="min-w-56">
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
            <Select value={selectedJan} onValueChange={(value) => setSelectedJan(value ?? "all")}>
              <SelectTrigger className="min-w-48">
                <SelectValue placeholder="JAN" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのJAN</SelectItem>
                {janOptions.map((jan) => (
                  <SelectItem key={jan} value={jan}>
                    {getProductLabel(jan)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant={showIntroducedOnly ? "default" : "outline"}
              onClick={() => setShowIntroducedOnly((current) => !current)}
            >
              {showIntroducedOnly ? "導入店のみ" : "全店舗表示"}
            </Button>
          </div>
        }
      >
        {!activeImport ? (
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "導入店舗データを読み込んでいます..."
              : "まだ導入店舗データがありません。Excelをアップロードしてください。"}
          </p>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <SummaryCard label="導入店舗数" value={`${summary.introduced}店舗`} />
              <SummaryCard label="一覧件数" value={`${summary.total}件`} />
              <SummaryCard
                label="取込形式"
                value={activeImport.formatKey === "row-list" ? "店舗一覧表" : "0/1フラグ表"}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              ファイル: {activeImport.fileName} / 取込日時:{" "}
              {new Date(activeImport.importedAt).toLocaleString("ja-JP")}
            </p>
            <div className="overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>JAN</TableHead>
                    <TableHead>商品名</TableHead>
                    <TableHead>店舗コード</TableHead>
                    <TableHead>店舗名</TableHead>
                    <TableHead>マスタ照合</TableHead>
                    <TableHead>住所</TableHead>
                    <TableHead>導入</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        表示対象の店舗がありません。
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs">{entry.jan}</TableCell>
                        <TableCell>{getProductLabel(entry.jan)}</TableCell>
                        <TableCell>{entry.storeCode || "-"}</TableCell>
                        <TableCell>{entry.storeName}</TableCell>
                        <TableCell>{entry.matchedStoreName === "店舗不明" ? "-" : entry.matchedStoreName}</TableCell>
                        <TableCell>{entry.address || "-"}</TableCell>
                        <TableCell>{entry.isIntroduced ? "導入" : "非導入"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Panel>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
