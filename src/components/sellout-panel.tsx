"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  buildSelloutMonthlyTotals,
  buildSelloutProductChartRows,
  filterSelloutEntries,
  getLatestSelloutYearMonth,
  getPreviousSelloutMonthKey,
  getSelloutMonthKey,
  getSelloutPreviousMonthTotals,
  summarizeSelloutMonthlyRows,
  type SelloutFilters,
} from "@/lib/sellout-view";
import { importSelloutWorkbook, readSelloutData } from "@/lib/supabase/sellout-actions";
import type { Client, Product, SelloutEntry } from "@/lib/types";

function formatYen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function formatSignedYen(diff: number) {
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  return `${sign}¥${Math.abs(diff).toLocaleString("ja-JP")}`;
}

function formatSignedDiff(diff: number) {
  return diff > 0 ? `+${diff.toLocaleString("ja-JP")}` : diff.toLocaleString("ja-JP");
}

function getDiffToneClass(diff: number) {
  if (diff > 0) {
    return "text-emerald-600";
  }

  return diff < 0 ? "text-red-600" : "text-muted-foreground";
}

function resolveSelloutProductName(jan: string, clientId: string, products: Product[]) {
  const product = products.find(
    (candidate) => candidate.clientId === clientId && candidate.jan === jan,
  );

  return product?.name ?? "未登録";
}

function buildFiltersForEntries(entries: SelloutEntry[], retailer = "all"): SelloutFilters {
  const latest = getLatestSelloutYearMonth(entries);

  return {
    retailer,
    storeName: "",
    productSearch: "",
    year: latest?.year ?? "all",
    month: latest?.month ?? "all",
  };
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
  products,
  onClientChange,
  initialEntries,
}: {
  clientId: string;
  initialDataClientId?: string;
  clients: Client[];
  products: Product[];
  onClientChange: (clientId: string) => void;
  initialEntries: SelloutEntry[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [filters, setFilters] = useState<SelloutFilters>(() =>
    buildFiltersForEntries(initialEntries),
  );
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
      setFilters(buildFiltersForEntries(initialEntries));
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
      setFilters(buildFiltersForEntries(data.entries));
      setIsLoading(false);
    }

    void loadSelloutData();

    return () => {
      cancelled = true;
    };
  }, [clientId, initialDataClientId, initialEntries]);

  const displayEntries = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        productName: resolveSelloutProductName(entry.jan, clientId, products),
      })),
    [clientId, entries, products],
  );

  const filterOptions = useMemo(
    () => buildSelloutFilterOptions(displayEntries, filters),
    [displayEntries, filters],
  );

  const filteredEntries = useMemo(
    () => filterSelloutEntries(displayEntries, filters),
    [displayEntries, filters],
  );

  // 月別推移は年月以外の条件だけで集計し、過去月の棒も見えるようにする
  const trendScopedEntries = useMemo(
    () =>
      filterSelloutEntries(displayEntries, {
        ...filters,
        year: "all",
        month: "all",
      }),
    [displayEntries, filters],
  );

  const monthlyRows = useMemo(
    () => buildSelloutMonthlyRows(filteredEntries),
    [filteredEntries],
  );

  // 前月比は年月フィルタ外の実績も要るので、月を絞らない集計から引く
  const monthlyTotals = useMemo(
    () => buildSelloutMonthlyTotals(trendScopedEntries),
    [trendScopedEntries],
  );

  const monthlyChartRows = useMemo(
    () => buildSelloutMonthlyChartRows(trendScopedEntries),
    [trendScopedEntries],
  );

  const productChartRows = useMemo(
    () => buildSelloutProductChartRows(filteredEntries),
    [filteredEntries],
  );

  const summary = useMemo(() => summarizeSelloutMonthlyRows(monthlyRows), [monthlyRows]);

  const unmatchedStoreCount = useMemo(
    () => new Set(monthlyRows.filter((row) => !row.isStoreMatched).map((row) => row.storeKey)).size,
    [monthlyRows],
  );

  const selectedMonthKey =
    filters.year !== "all" && filters.month !== "all"
      ? `${filters.year}-${filters.month.padStart(2, "0")}`
      : "";

  const previousMonthSummary = useMemo(() => {
    const previousMonthKey = getPreviousSelloutMonthKey(selectedMonthKey);
    if (!previousMonthKey) {
      return null;
    }

    const previousMonthEntries = trendScopedEntries.filter(
      (entry) => getSelloutMonthKey(entry) === previousMonthKey,
    );

    if (previousMonthEntries.length === 0) {
      return null;
    }

    return summarizeSelloutMonthlyRows(buildSelloutMonthlyRows(previousMonthEntries));
  }, [selectedMonthKey, trendScopedEntries]);

  // 単月を選んでいるときだけ前月比が成り立つ。前月実績がなければ各値 null。
  const summaryDiff = useMemo(() => {
    if (!selectedMonthKey) {
      return null;
    }

    if (!previousMonthSummary) {
      return {
        totalAmount: null,
        totalQty: null,
        storeCount: null,
        averageAmountPerStore: null,
        averageQtyPerStore: null,
      } satisfies Record<keyof typeof summary, null>;
    }

    return {
      totalAmount: summary.totalAmount - previousMonthSummary.totalAmount,
      totalQty: summary.totalQty - previousMonthSummary.totalQty,
      storeCount: summary.storeCount - previousMonthSummary.storeCount,
      averageAmountPerStore:
        summary.averageAmountPerStore - previousMonthSummary.averageAmountPerStore,
      averageQtyPerStore:
        Math.round((summary.averageQtyPerStore - previousMonthSummary.averageQtyPerStore) * 100) /
        100,
    };
  }, [previousMonthSummary, selectedMonthKey, summary]);

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

  const availableMonthKeys = useMemo(() => {
    const scoped = filterSelloutEntries(displayEntries, {
      ...filters,
      year: "all",
      month: "all",
    });

    return Array.from(
      new Set(scoped.map((entry) => getSelloutMonthKey(entry)).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
  }, [displayEntries, filters.retailer, filters.storeName, filters.productSearch]);

  function updateFilter<K extends keyof SelloutFilters>(key: K, value: SelloutFilters[K]) {
    setFilters((current) => {
      const next = { ...current, [key]: value };

      if (key === "retailer") {
        next.storeName = "";
        next.productSearch = "";
      }

      return next;
    });
  }

  function updateYearMonth(year: string, month: string) {
    setFilters((current) => ({
      ...current,
      year,
      month,
    }));
  }

  function selectMonthFromChart(monthKey: string) {
    const [year, month] = monthKey.split("-");
    if (!year || !month) {
      return;
    }

    updateYearMonth(year, String(Number(month)));
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
    setFilters(
      buildFiltersForEntries(data.entries, result.importBatch.retailer || "all"),
    );
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
        <SummaryCard
          label="売上金額（上代）"
          value={formatYen(summary.totalAmount)}
          diff={summaryDiff && { value: summaryDiff.totalAmount, format: formatSignedYen }}
        />
        <SummaryCard
          label="販売個数"
          value={`${summary.totalQty.toLocaleString("ja-JP")}個`}
          diff={
            summaryDiff && {
              value: summaryDiff.totalQty,
              format: (diff) => `${formatSignedDiff(diff)}個`,
            }
          }
        />
        <SummaryCard
          label="店舗数"
          value={`${summary.storeCount.toLocaleString("ja-JP")}店`}
          diff={
            summaryDiff && {
              value: summaryDiff.storeCount,
              format: (diff) => `${formatSignedDiff(diff)}店`,
            }
          }
        />
        <SummaryCard
          label="1店舗平均売上金額"
          value={formatYen(summary.averageAmountPerStore)}
          diff={
            summaryDiff && { value: summaryDiff.averageAmountPerStore, format: formatSignedYen }
          }
        />
        <SummaryCard
          label="1店舗平均個数"
          value={`${summary.averageQtyPerStore.toLocaleString("ja-JP", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })}個`}
          diff={
            summaryDiff && {
              value: summaryDiff.averageQtyPerStore,
              format: (diff) => `${formatSignedDiff(diff)}個`,
            }
          }
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
            <MonthYearPicker
              year={filters.year}
              month={filters.month}
              availableMonthKeys={availableMonthKeys}
              onChange={updateYearMonth}
            />
          </div>

          <SelloutCharts
            monthlyRows={monthlyChartRows}
            productRows={productChartRows}
            selectedMonthKey={selectedMonthKey}
            onMonthSelect={selectMonthFromChart}
          />

          {unmatchedStoreCount > 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              店舗マスタと照合できなかった店舗が{unmatchedStoreCount}
              件あります。「店舗不明」の行は、店舗マスタに正しい店名を登録すると解消します。
            </p>
          ) : null}

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
                    <TableHead>小売企業</TableHead>
                    <TableHead>店舗</TableHead>
                    <TableHead>JAN</TableHead>
                    <TableHead>商品名</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">平均差</TableHead>
                    <TableHead className="text-right">前月差</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyRows.map((row) => {
                    const qtyDiff = Math.round(row.qty - summary.averageQtyPerStore);
                    const previousMonth = getSelloutPreviousMonthTotals(row, monthlyTotals);
                    const previousMonthQtyDiff = previousMonth ? row.qty - previousMonth.qty : null;

                    return (
                      <TableRow key={`${row.month}-${row.retailer}-${row.storeKey}-${row.jan}`}>
                        <TableCell>{row.retailer}</TableCell>
                        <TableCell className={row.isStoreMatched ? undefined : "text-amber-600"}>
                          {row.storeName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.jan}</TableCell>
                        <TableCell>{row.productName}</TableCell>
                        <TableCell className="text-right">{row.qty.toLocaleString("ja-JP")}</TableCell>
                        <TableCell className={`text-right font-medium ${getDiffToneClass(qtyDiff)}`}>
                          {formatSignedDiff(qtyDiff)}
                        </TableCell>
                        {previousMonthQtyDiff === null ? (
                          <TableCell className="text-right text-muted-foreground">—</TableCell>
                        ) : (
                          <TableCell
                            className={`text-right font-medium ${getDiffToneClass(previousMonthQtyDiff)}`}
                          >
                            {formatSignedDiff(previousMonthQtyDiff)}
                          </TableCell>
                        )}
                        <TableCell className="text-right">{formatYen(row.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
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

function MonthYearPicker({
  year,
  month,
  availableMonthKeys,
  onChange,
}: {
  year: string;
  month: string;
  availableMonthKeys: string[];
  onChange: (year: string, month: string) => void;
}) {
  const availableYears = useMemo(() => {
    const years = Array.from(
      new Set(availableMonthKeys.map((key) => key.slice(0, 4)).filter((value) => /^\d{4}$/.test(value))),
    ).sort((a, b) => Number(a) - Number(b));

    return years;
  }, [availableMonthKeys]);

  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    if (year !== "all") {
      return year;
    }

    return availableYears[availableYears.length - 1] ?? String(new Date().getFullYear());
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (year !== "all") {
      setViewYear(year);
      return;
    }

    setViewYear((current) => {
      if (availableYears.includes(current)) {
        return current;
      }

      return availableYears[availableYears.length - 1] ?? current;
    });
  }, [availableYears, year]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const availableMonths = useMemo(() => {
    return new Set(
      availableMonthKeys
        .filter((key) => key.startsWith(`${viewYear}-`))
        .map((key) => String(Number(key.slice(5)))),
    );
  }, [availableMonthKeys, viewYear]);

  const viewYearIndex = availableYears.indexOf(viewYear);
  const canGoPrev = viewYearIndex > 0;
  const canGoNext = viewYearIndex >= 0 && viewYearIndex < availableYears.length - 1;

  const label =
    year !== "all" && month !== "all"
      ? `${year}年${month}月`
      : year !== "all"
        ? `${year}年`
        : "すべての年月";

  return (
    <Field className="gap-1">
      <FieldLabel className="text-xs text-muted-foreground">年月</FieldLabel>
      <div ref={rootRef} className="relative min-w-[160px]">
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-between px-2.5 font-normal"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span>{label}</span>
          <span className="text-muted-foreground">▾</span>
        </Button>

        {isOpen ? (
          <div className="absolute right-0 z-20 mt-1 w-[240px] rounded-xl border bg-popover p-3 shadow-md">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!canGoPrev}
                onClick={() => {
                  if (canGoPrev) {
                    setViewYear(availableYears[viewYearIndex - 1]);
                  }
                }}
              >
                <ChevronLeft />
              </Button>
              <p className="text-sm font-medium">{viewYear}年</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!canGoNext}
                onClick={() => {
                  if (canGoNext) {
                    setViewYear(availableYears[viewYearIndex + 1]);
                  }
                }}
              >
                <ChevronRight />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 12 }, (_, index) => {
                const monthValue = String(index + 1);
                const isAvailable = availableMonths.has(monthValue);
                const isSelected = year === viewYear && month === monthValue;

                return (
                  <button
                    key={monthValue}
                    type="button"
                    disabled={!isAvailable}
                    className={`rounded-lg px-2 py-2 text-sm transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : isAvailable
                          ? "hover:bg-muted"
                          : "cursor-not-allowed text-muted-foreground/40"
                    }`}
                    onClick={() => {
                      onChange(viewYear, monthValue);
                      setIsOpen(false);
                    }}
                  >
                    {monthValue}月
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                onChange("all", "all");
                setIsOpen(false);
              }}
            >
              すべての年月
            </Button>
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function SummaryCard({
  label,
  value,
  diff,
}: {
  label: string;
  value: string;
  /** null を渡すと単月表示でないため前月比を出さない。value が null なら前月実績なし。 */
  diff?: { value: number | null; format: (value: number) => string } | null;
}) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="px-3 py-2.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tracking-tight">{value}</p>
        {diff ? (
          diff.value === null ? (
            <p className="mt-0.5 text-xs text-muted-foreground">前月比 —</p>
          ) : (
            <p className={`mt-0.5 text-xs font-medium ${getDiffToneClass(diff.value)}`}>
              前月比 {diff.format(diff.value)}
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
