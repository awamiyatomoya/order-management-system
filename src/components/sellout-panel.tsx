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
import { importSelloutWorkbook, readSelloutData } from "@/lib/supabase/sellout-actions";
import type { Client, SelloutEntry, SelloutImport } from "@/lib/types";

function formatYen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function formatPeriod(start: string, end: string) {
  if (!start && !end) {
    return "期間不明";
  }

  if (start === end || !end) {
    return start;
  }

  return `${start} 〜 ${end}`;
}

export function SelloutPanel({
  clientId,
  initialDataClientId,
  clients,
  onClientChange,
  initialImports,
  initialEntries,
}: {
  clientId: string;
  initialDataClientId?: string;
  clients: Client[];
  onClientChange: (clientId: string) => void;
  initialImports: SelloutImport[];
  initialEntries: SelloutEntry[];
}) {
  const [imports, setImports] = useState(initialImports);
  const [entries, setEntries] = useState(initialEntries);
  const [selectedRetailerFilter, setSelectedRetailerFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const skipInitialServerLoadRef = useRef(true);

  useEffect(() => {
    if (!clientId) {
      setImports([]);
      setEntries([]);
      setSelectedRetailerFilter("all");
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

    async function loadSelloutData() {
      setIsLoading(true);
      const data = await readSelloutData(clientId);
      if (cancelled) {
        return;
      }

      setImports(data.imports);
      setEntries(data.entries);
      setIsLoading(false);
    }

    void loadSelloutData();

    return () => {
      cancelled = true;
    };
  }, [clientId, initialDataClientId, initialEntries, initialImports]);

  const latestImportsByRetailer = useMemo(() => {
    const map = new Map<string, SelloutImport>();
    imports.forEach((importBatch) => {
      const retailer = importBatch.retailer.trim();
      if (retailer && !map.has(retailer)) {
        map.set(retailer, importBatch);
      }
    });
    return Array.from(map.values());
  }, [imports]);

  const retailerOptions = useMemo(
    () => [...new Set(entries.map((entry) => entry.retailer).filter(Boolean))].sort(),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return entries.filter((entry) => {
      if (selectedRetailerFilter !== "all" && entry.retailer !== selectedRetailerFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        entry.storeName,
        entry.matchedStoreName,
        entry.jan,
        entry.productName,
        entry.retailer,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [entries, searchQuery, selectedRetailerFilter]);

  const summary = useMemo(() => {
    const storeKeys = new Set(
      filteredEntries.map((entry) => entry.matchedStoreCode || entry.storeCode || entry.storeName),
    );

    return {
      entryCount: filteredEntries.length,
      storeCount: storeKeys.size,
      totalQty: filteredEntries.reduce((sum, entry) => sum + entry.qty, 0),
      totalAmount: filteredEntries.reduce((sum, entry) => sum + entry.amount, 0),
    };
  }, [filteredEntries]);

  async function handleUpload(file: File) {
    if (!clientId) {
      setNotice("クライアントを選択してください。");
      return;
    }

    setIsUploading(true);
    setNotice("");

    const formData = new FormData();
    formData.set("clientId", clientId);
    formData.set("file", file);

    const result = await importSelloutWorkbook(formData);
    setIsUploading(false);
    setFileInputKey((value) => value + 1);

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    setNotice(result.message);
    const data = await readSelloutData(clientId);
    setImports(data.imports);
    setEntries(data.entries);
    setSelectedRetailerFilter(result.importBatch.retailer || "all");
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <Field>
              <FieldLabel>クライアント</FieldLabel>
              <Select
                items={clients.map((client) => ({ label: client.name, value: client.id }))}
                value={clientId}
                onValueChange={(value) => onClientChange(value ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="クライアントを選択" />
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

            <FileUploadButton
              key={fileInputKey}
              label="セルアウトExcelをアップロード"
              description="ロフト・ハンズなど小売チェーン別のファイルを自動判別して取り込みます。"
              accept=".xlsx,.xls,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!clientId || isUploading}
              fullWidth
              onFileChange={(file) => {
                if (file) {
                  void handleUpload(file);
                }
              }}
            />

            {isUploading ? (
              <UploadStatus isProcessing message="セルアウトファイルを取り込み中..." />
            ) : null}
            {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

            <p className="text-xs text-muted-foreground">
              新しい小売チェーンを追加するときは、専用パーサーではなく「レイアウト型 + プロファイル設定」を1件追加するだけで対応できます。
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="明細件数" value={`${summary.entryCount.toLocaleString("ja-JP")}件`} />
          <SummaryCard label="店舗数" value={`${summary.storeCount.toLocaleString("ja-JP")}店`} />
          <SummaryCard label="売上数量" value={`${summary.totalQty.toLocaleString("ja-JP")}個`} />
          <SummaryCard label="売上金額" value={formatYen(summary.totalAmount)} />
        </div>
      </div>

      {latestImportsByRetailer.length > 0 ? (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <h3 className="text-sm font-medium">小売チェーン別 最新取込</h3>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {latestImportsByRetailer.map((importBatch) => (
                <div
                  key={importBatch.id}
                  className="rounded-lg border border-border/70 px-4 py-3 text-sm"
                >
                  <p className="font-medium">{importBatch.retailer}</p>
                  <p className="text-muted-foreground">
                    {formatPeriod(importBatch.periodStart, importBatch.periodEnd)}
                  </p>
                  <p className="text-muted-foreground">
                    {importBatch.entryCount}件 / {importBatch.storeCount}店舗 /{" "}
                    {formatYen(importBatch.totalAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {importBatch.fileName}（{importBatch.profileKey}）
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <Field className="min-w-40">
              <FieldLabel>小売チェーン</FieldLabel>
              <Select
                items={[
                  { label: "すべて", value: "all" },
                  ...retailerOptions.map((retailer) => ({ label: retailer, value: retailer })),
                ]}
                value={selectedRetailerFilter}
                onValueChange={(value) => setSelectedRetailerFilter(value ?? "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">すべて</SelectItem>
                    {retailerOptions.map((retailer) => (
                      <SelectItem key={retailer} value={retailer}>
                        {retailer}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="min-w-56 flex-1">
              <FieldLabel>検索</FieldLabel>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="店舗名・JAN・商品名"
              />
            </Field>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedRetailerFilter("all");
                setSearchQuery("");
              }}
            >
              絞り込み解除
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">セルアウトデータを読み込み中...</p>
          ) : filteredEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              セルアウトデータがありません。小売チェーンから届いたExcelをアップロードしてください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>期間</TableHead>
                    <TableHead>小売</TableHead>
                    <TableHead>店舗</TableHead>
                    <TableHead>JAN</TableHead>
                    <TableHead>商品</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="text-right">在庫</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatPeriod(entry.periodStart, entry.periodEnd)}</TableCell>
                      <TableCell>{entry.retailer}</TableCell>
                      <TableCell>
                        <div>{entry.matchedStoreName || entry.storeName}</div>
                        {entry.matchedStoreName && entry.matchedStoreName !== entry.storeName ? (
                          <div className="text-xs text-muted-foreground">{entry.storeName}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.jan}</TableCell>
                      <TableCell>{entry.productName}</TableCell>
                      <TableCell className="text-right">{entry.qty.toLocaleString("ja-JP")}</TableCell>
                      <TableCell className="text-right">{formatYen(entry.amount)}</TableCell>
                      <TableCell className="text-right">
                        {entry.stock === null ? "-" : entry.stock.toLocaleString("ja-JP")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
