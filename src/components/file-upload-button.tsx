"use client";

import { LoaderCircle } from "lucide-react";
import { useId, useRef } from "react";
import { Input } from "@/components/ui/input";

export function FileUploadButton({
  accept,
  disabled,
  fullWidth = false,
  label = "発注ファイルをアップロード",
  description = "PDF、CSV、Excelファイルを選択できます。",
  onFileChange,
}: {
  accept: string;
  disabled: boolean;
  fullWidth?: boolean;
  label?: string;
  description?: string;
  onFileChange: (file: File | null) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={`inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3.5 py-2 text-sm font-bold text-white shadow-[0_3px_0_rgb(29,78,216),0_6px_10px_rgba(37,99,235,0.28)] transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-[0_5px_0_rgb(29,78,216),0_10px_14px_rgba(37,99,235,0.32)] active:translate-y-1 active:shadow-[0_1px_0_rgb(29,78,216),0_3px_8px_rgba(37,99,235,0.22)] ${
          fullWidth ? "w-full" : ""
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        {label}
      </button>
      <Input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      {description ? <p className="text-[11px] text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function UploadStatus({
  isProcessing,
  message,
}: {
  isProcessing: boolean;
  message: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {isProcessing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      <span>{message}</span>
    </div>
  );
}
