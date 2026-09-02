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
  createSelloutFileDownloadUrl,
  deleteSelloutImport,
  importSelloutWorkbook,
  readSelloutData,
} from "@/lib/supabase/sellout-actions";
import type { Client, SelloutImport } from "@/lib/types";

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

async function downloadSelloutFile(importBatch: SelloutImport) {
  if (!importBatch.fileStoragePath) {
    window.alert("この取込分には元ファイルが保存されていません。再アップロード後のファイルからダウンロードできます。");
    return;
  }

  const result = await createSelloutFileDownloadUrl(importBatch.fileStoragePath);
  if (!result.ok) {
    window.alert(result.message);
    return;
  }

  try {
    const response = await fetch(result.url);
    if (!response.ok) {
      throw new Error("ファイルを取得できませんでした。");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = importBatch.fileName || "sellout.xlsx";
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "ダウンロードに失敗しました。");
  }
}

export function SelloutFilesPanel({
  clientId,
  initialDataClientId,
  clients,
  onClientChange,
  initialImports,
}: {
  clientId: string;
  initialDataClientId?: string;
  clients: Client[];
  onClientChange: (clientId: string) => void;
  initialImports: SelloutImport[];
}) {
  const [imports, setImports] = useState(initialImports);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [search, setSearch] = useState("");
  const skipInitialServerLoadRef = useRef(true);

  useEffect(() => {
    if (!clientId) {
      setImports([]);
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
      setIsLoading(false);
      return;
    }

    skipInitialServerLoadRef.current = false;

    let cancelled = false;

    async function loadSelloutImports() {
      setIsLoading(true);
      const data = await readSelloutData(clientId);
      if (cancelled) {
        return;
      }

      setImports(data.imports);
      setIsLoading(false);
    }

    void loadSelloutImports();

    return () => {
      cancelled = true;
    };
  }, [clientId, initialDataClientId, initialImports]);

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
  }

  async function handleDelete(importBatch: SelloutImport) {
    if (!clientId) {
      return;
    }

    const confirmed = window.confirm(
      `${importBatch.retailer}（${formatPeriod(importBatch.periodStart, importBatch.periodEnd)}）の取込を削除します。売上実績からも消えます。よろしいですか？`,
    );
    if (!confirmed) {
      return;
    }

    const result = await deleteSelloutImport(importBatch.id, clientId);
    setNotice(result.message);
    if (!result.ok) {
      return;
    }

    const data = await readSelloutData(clientId);
    setImports(data.imports);
  }

  const filteredImports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return imports;
    }

    return imports.filter((importBatch) => {
      return (
        importBatch.fileName.toLowerCase().includes(query) ||
        importBatch.retailer.toLowerCase().includes(query) ||
        importBatch.profileKey.toLowerCase().includes(query)
      );
    });
  }, [imports, search]);

  return (
    <section className="grid gap-4">
      <Card size="sm">
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,320px)_minmax(220px,1fr)_minmax(240px,1fr)] lg:items-end">
            <Field className="gap-1">
              <FieldLabel className="text-xs text-muted-foreground">クライアント</FieldLabel>
              <Select
                items={clients.map((client) => ({ label: client.name, value: client.id }))}
                value={clientId}
                onValueChange={(value) => onClientChange(value ?? "")}
              >
                <SelectTrigger className="h-8 w-full">
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

            <div className="flex flex-col gap-1">
              <FieldLabel className="text-xs text-muted-foreground">セルアウトExcel</FieldLabel>
              <FileUploadButton
                key={fileInputKey}
                label="セルアウトExcelをアップロード"
                description=""
                compact
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
            </div>

            <Field className="gap-1">
              <FieldLabel className="text-xs text-muted-foreground">検索</FieldLabel>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ファイル名・企業・プロファイル"
                className="h-8"
              />
            </Field>
          </div>

          {notice && !isUploading ? (
            <p className="mt-3 text-sm text-muted-foreground">{notice}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div>
            <h3 className="text-base font-medium">セルアウト取込ファイル</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              取り込んだセルアウトExcelの履歴です。保存済みのファイルはダウンロードできます。売上の確認・分析は「売上実績」で行えます。
            </p>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">セルアウト取込履歴を読み込み中...</p>
          ) : imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              このクライアントのセルアウト取込ファイルはまだありません。
            </p>
          ) : filteredImports.length === 0 ? (
            <p className="text-sm text-muted-foreground">検索条件に一致する取込ファイルはありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>取込日時</TableHead>
                    <TableHead>企業</TableHead>
                    <TableHead>対象期間</TableHead>
                    <TableHead>ファイル名</TableHead>
                    <TableHead>プロファイル</TableHead>
                    <TableHead className="text-right">件数</TableHead>
                    <TableHead className="text-right">店舗数</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredImports.map((importBatch) => (
                    <TableRow key={importBatch.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(importBatch.importedAt).toLocaleString("ja-JP")}
                      </TableCell>
                      <TableCell>{importBatch.retailer || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatPeriod(importBatch.periodStart, importBatch.periodEnd)}
                      </TableCell>
                      <TableCell>{importBatch.fileName}</TableCell>
                      <TableCell className="font-mono text-xs">{importBatch.profileKey}</TableCell>
                      <TableCell className="text-right">
                        {importBatch.entryCount.toLocaleString("ja-JP")}
                      </TableCell>
                      <TableCell className="text-right">
                        {importBatch.storeCount.toLocaleString("ja-JP")}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatYen(importBatch.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {importBatch.fileStoragePath ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void downloadSelloutFile(importBatch);
                              }}
                            >
                              ダウンロード
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">ファイルなし</span>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void handleDelete(importBatch);
                            }}
                          >
                            削除
                          </Button>
                        </div>
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
