"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { readSelloutData } from "@/lib/supabase/sellout-actions";
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
          <div className="grid gap-3 md:grid-cols-[minmax(240px,320px)_minmax(220px,1fr)] md:items-end">
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div>
            <h3 className="text-base font-medium">セルアウト取込ファイル</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              取り込んだセルアウトExcelの履歴です。売上の確認・分析は「売上実績」で行えます。
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
