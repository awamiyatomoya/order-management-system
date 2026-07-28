"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileUploadButton, UploadStatus } from "@/components/file-upload-button";
import { SelloutCharts } from "@/components/sellout-charts";
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
  storeName: "",
  productSearch: "",
  year: "all",
  month: "all",
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
    const storeCount = storeKeys.size;
    const totalQty = monthlyRows.reduce((sum, row) => sum + row.qty, 0);
    const totalAmount = monthlyRows.reduce((sum, row) => sum + row.amount, 0);

    return {
      storeCount,
      totalQty,
      totalAmount,
      averageAmountPerStore: storeCount > 0 ? Math.round(totalAmount / storeCount) : 0,
      averageQtyPerStore: storeCount > 0 ? Math.round(totalQty / storeCount) : 0,
    };
  }, [monthlyRows]);

  const storeSuggestions = useMemo(() => {
    const query = filters.storeName.trim().toLowerCase();
    return filterOptions.stores
      .filter((store) => !query || store.toLowerCase().includes(query))
      .slice(0, 8)
      .map((store) => ({ value: store, label: store }));
  }, [filterOptions.stores, filters.storeName]);

  const productSuggestions = useMemo(() => {
    const query = filters.productSearch.trim().toLowerCase();
    return filterOptions.products
      .filter((product) => {
        if (!query) {
          return true;
        }

        return (
          product.label.toLowerCase().includes(query) ||
          product.productName.toLowerCase().includes(query) ||
          product.jan.toLowerCase().includes(query)
        );
      })
      .slice(0, 8)
      .map((product) => ({ value: product.value, label: product.label }));
  }, [filterOptions.products, filters.productSearch]);

  function updateFilter<K extends keyof SelloutFilters>(key: K, value: SelloutFilters[K]) {
    setFilters((current) => {
      const next = { ...current, [key]: value };

      if (key === "retailer") {
        next.storeName = "";
        next.productSearch = "";
      }

      if (key === "year" && value === "all") {
        next.month = "all";
      }

      if (key === "year" && value !== "all" && current.month !== "all") {
        const availableMonths = buildSelloutFilterOptions(entries, {
          ...next,
          month: "all",
        }).months;
        if (!availableMonths.includes(current.month)) {
          next.month = "all";
        }
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
    <section className="grid gap-3">
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

          {notice && !isUploading ? <p className="mt-3 text-sm text-muted-foreground">{notice}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="売上金額（上代）" value={formatYen(summary.totalAmount)} />
        <SummaryCard label="販売個数" value={`${summary.totalQty.toLocaleString("ja-JP")}個`} />
        <SummaryCard label="店舗数" value={`${summary.storeCount.toLocaleString("ja-JP")}店`} />
        <SummaryCard label="1店舗平均売上金額" value={formatYen(summary.averageAmountPerStore)} />
        <SummaryCard
          label="1店舗平均個数"
          value={`${summary.averageQtyPerStore.toLocaleString("ja-JP")}個`}
        />
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_auto]">
            <FilterSelect
              label="小売企業"
              value={filters.retailer}
              options={filterOptions.retailers}
              onChange={(value) => updateFilter("retailer", value)}
            />
            <SuggestInput
              label="店舗名"
              value={filters.storeName}
              placeholder="店舗名を入力"
              suggestions={storeSuggestions}
              onChange={(value) => updateFilter("storeName", value)}
            />
            <SuggestInput
              label="商品名 / JAN"
              value={filters.productSearch}
              placeholder="商品名またはJANを入力"
              suggestions={productSuggestions}
              onChange={(value) => updateFilter("productSearch", value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect
                label="年"
                value={filters.year}
                options={filterOptions.years}
                allLabel="すべての年"
                onChange={(value) => updateFilter("year", value)}
              />
              <FilterSelect
                label="月"
                value={filters.month}
                options={filterOptions.months}
                optionLabel={(month) => `${month}月`}
                allLabel="すべての月"
                onChange={(value) => updateFilter("month", value)}
              />
            </div>
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
                    <TableHead>小売企業</TableHead>
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
  allLabel = "すべて",
  optionLabel,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  allLabel?: string;
  optionLabel?: (option: string) => string;
}) {
  return (
    <Field className="gap-1">
      <FieldLabel className="text-xs text-muted-foreground">{label}</FieldLabel>
      <Select
        items={[
          { label: allLabel, value: "all" },
          ...options.map((option) => ({
            label: optionLabel ? optionLabel(option) : option,
            value: option,
          })),
        ]}
        value={value}
        onValueChange={(nextValue) => onChange(nextValue ?? "all")}
      >
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{allLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {optionLabel ? optionLabel(option) : option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function SuggestInput({
  label,
  value,
  placeholder,
  suggestions,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  suggestions: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const showSuggestions = isOpen && suggestions.length > 0;

  return (
    <Field className="gap-1">
      <FieldLabel className="text-xs text-muted-foreground">{label}</FieldLabel>
      <div ref={rootRef} className="relative">
        <Input
          value={value}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
        />
        {showSuggestions ? (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.value}-${suggestion.label}`}
                type="button"
                className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(suggestion.value);
                  setIsOpen(false);
                }}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="px-3 py-2.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
