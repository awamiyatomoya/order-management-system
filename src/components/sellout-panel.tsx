"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileUploadButton, UploadStatus } from "@/components/file-upload-button";
import { SelloutCharts } from "@/components/sellout-charts";
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
  buildSelloutFilterOptions,
  buildSelloutMonthlyChartRows,
  buildSelloutMonthlyRows,
  buildSelloutProductChartRows,
  filterSelloutEntries,
  type SelloutFilters,
} from "@/lib/sellout-view";
import { importSelloutWorkbook, readSelloutData } from "@/lib/supabase/sellout-actions";
import type { Client, SelloutEntry } from "@/lib/types";

function formatYen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

const defaultFilters: SelloutFilters = {
  retailer: "all",
  storeName: "all",
  productName: "all",
  jan: "all",
};

export function SelloutPanel({
  clientId,
  initialDataClientId,
  clients,
  onClientChange,
  initialEntries,
}: {
  clientId: string;
  initialDataClientId?: string;
  clients: Client[];
  onClientChange: (clientId: string) => void;
  initialEntries: SelloutEntry[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [filters, setFilters] = useState<SelloutFilters>(defaultFilters);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const skipInitialServerLoadRef = useRef(true);

  useEffect(() => {
    if (!clientId) {
      setEntries([]);
      setFilters(defaultFilters);
      setIsLoading(false);
      return;
    }

    if (
      skipInitialServerLoadRef.current &&
      clientId === initialDataClientId &&
      initialDataClientId
    ) {
      skipInitialServerLoadRef.current = false;
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

      setEntries(data.entries);
      setIsLoading(false);
    }

    void loadSelloutData();

    return () => {
      cancelled = true;
    };
  }, [clientId, initialDataClientId, initialEntries]);

  const filterOptions = useMemo(
    () => buildSelloutFilterOptions(entries, filters),
    [entries, filters],
  );

  const filteredEntries = useMemo(
    () => filterSelloutEntries(entries, filters),
    [entries, filters],
  );

  const monthlyRows = useMemo(
    () => buildSelloutMonthlyRows(filteredEntries),
    [filteredEntries],
  );

  const monthlyChartRows = useMemo(
    () => buildSelloutMonthlyChartRows(filteredEntries),
    [filteredEntries],
  );

  const productChartRows = useMemo(
    () => buildSelloutProductChartRows(filteredEntries),
    [filteredEntries],
  );

  const summary = useMemo(() => {
    const storeKeys = new Set(monthlyRows.map((row) => row.storeName));

    return {
      entryCount: monthlyRows.length,
      storeCount: storeKeys.size,
      totalQty: monthlyRows.reduce((sum, row) => sum + row.qty, 0),
      totalAmount: monthlyRows.reduce((sum, row) => sum + row.amount, 0),
    };
  }, [monthlyRows]);

  function updateFilter<K extends keyof SelloutFilters>(key: K, value: SelloutFilters[K]) {
    setFilters((current) => {
      const next = { ...current, [key]: value };

      if (key === "retailer") {
        next.storeName = "all";
        next.productName = "all";
        next.jan = "all";
      }

      if (key === "storeName") {
        next.productName = "all";
        next.jan = "all";
      }

      if (key === "productName") {
        next.jan = "all";
      }

      return next;
    });
  }

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
    setEntries(data.entries);
    setFilters({
      ...defaultFilters,
      retailer: result.importBatch.retailer || "all",
    });
  }

  return (
    <section className="grid gap-4">
      <Card size="sm">
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,360px)_minmax(240px,1fr)] lg:items-end">
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
          </div>

          {notice && !isUploading ? <p className="mt-2 text-sm text-muted-foreground">{notice}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="月次明細" value={`${summary.entryCount.toLocaleString("ja-JP")}件`} />
        <SummaryCard label="店舗数" value={`${summary.storeCount.toLocaleString("ja-JP")}店`} />
        <SummaryCard label="売上数量" value={`${summary.totalQty.toLocaleString("ja-JP")}個`} />
        <SummaryCard label="売上金額" value={formatYen(summary.totalAmount)} />
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              label="企業"
              value={filters.retailer}
              options={filterOptions.retailers}
              onChange={(value) => updateFilter("retailer", value)}
            />
            <FilterSelect
              label="店舗"
              value={filters.storeName}
              options={filterOptions.stores}
              onChange={(value) => updateFilter("storeName", value)}
            />
            <FilterSelect
              label="商品"
              value={filters.productName}
              options={filterOptions.products}
              onChange={(value) => updateFilter("productName", value)}
            />
            <FilterSelect
              label="JAN"
              value={filters.jan}
              options={filterOptions.jans}
              onChange={(value) => updateFilter("jan", value)}
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setFilters(defaultFilters)}>
              絞り込み解除
            </Button>
          </div>

          <SelloutCharts monthlyRows={monthlyChartRows} productRows={productChartRows} />

          {isLoading ? (
            <p className="text-sm text-muted-foreground">セルアウトデータを読み込み中...</p>
          ) : monthlyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              セルアウトデータがありません。小売チェーンから届いたExcelをアップロードしてください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>月</TableHead>
                    <TableHead>企業</TableHead>
                    <TableHead>店舗</TableHead>
                    <TableHead>JAN</TableHead>
                    <TableHead>商品名</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyRows.map((row) => (
                    <TableRow key={`${row.month}-${row.retailer}-${row.storeName}-${row.jan}`}>
                      <TableCell>{row.month}</TableCell>
                      <TableCell>{row.retailer}</TableCell>
                      <TableCell>{row.storeName}</TableCell>
                      <TableCell className="font-mono text-xs">{row.jan}</TableCell>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell className="text-right">{row.qty.toLocaleString("ja-JP")}</TableCell>
                      <TableCell className="text-right">{formatYen(row.amount)}</TableCell>
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={[
          { label: "すべて", value: "all" },
          ...options.map((option) => ({ label: option, value: option })),
        ]}
        value={value}
        onValueChange={(nextValue) => onChange(nextValue ?? "all")}
      >
        <SelectTrigger>
          <SelectValue placeholder="すべて" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">すべて</SelectItem>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
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
