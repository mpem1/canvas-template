"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { fromPx, round2, toPx } from "@/lib/editor/units";
import type { Unit } from "@/lib/editor/types";

/**
 * Numeric input bound to an internal pixel value, displayed in the doc unit.
 * Commits on blur or Enter.
 */
export function NumberField({
  valuePx,
  unit,
  onCommitPx,
  min,
  max,
  step,
  label,
  suffix,
  disabled = false,
  decimals = 2,
  className = "",
}: {
  valuePx: number;
  unit?: Unit;
  onCommitPx: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
  disabled?: boolean;
  decimals?: number;
  className?: string;
}) {
  const display = unit ? fromPx(valuePx, unit) : valuePx;
  // `draft` is non-null only while the user is editing the field;
  // otherwise the incoming value renders directly.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(round2(display));

  const commit = () => {
    const n = parseFloat(shown);
    setDraft(null);
    if (Number.isNaN(n)) return;
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    const px = unit ? toPx(v, unit) : v;
    if (Math.round(px * 100) / 100 !== Math.round(valuePx * 100) / 100) {
      onCommitPx(px);
    }
  };

  return (
    <label className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      {label && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </span>
      )}
      <span className="flex items-center rounded-md border border-zinc-300 bg-white focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/40">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={shown}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-full min-w-0 bg-transparent px-2 py-1 text-xs text-zinc-800 outline-none disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
        />
        {suffix && <span className="pr-1.5 text-[10px] text-zinc-400">{suffix}</span>}
      </span>
    </label>
  );
}

/** Color picker with hex entry; supports a "none" (transparent) state. */
export function ColorField({
  value,
  onChange,
  allowNone = false,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
  label?: string;
}) {
  const isNone = value === "none";
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {label && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </span>
      )}
      <div className="flex items-center gap-1">
        <label
          className="relative h-6 w-7 shrink-0 cursor-pointer overflow-hidden rounded border border-zinc-300"
          style={
            isNone
              ? {
                  backgroundImage:
                    "linear-gradient(135deg, transparent 44%, #ef4444 46%, #ef4444 54%, transparent 56%)",
                }
              : { background: value }
          }
        >
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={isNone ? "#ffffff" : value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label ? `${label} color picker` : "Color picker"}
          />
        </label>
        <input
          type="text"
          value={isNone ? "none" : value}
          onChange={(e) => {
            const t = e.target.value.trim();
            if (allowNone && t === "none") onChange("none");
            else if (/^#[0-9a-fA-F]{3,8}$/.test(t)) onChange(t);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1.5 py-1 font-mono text-[11px] text-zinc-700 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40"
        />
        {allowNone && (
          <button
            type="button"
            title="No fill / transparent"
            aria-label="Set to none"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            onClick={() => onChange("none")}
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Small section title used across the properties panel. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 first:mt-0">
      {children}
    </div>
  );
}
