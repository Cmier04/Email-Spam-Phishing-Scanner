import {
  FlaskConical,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import type { WhatIfResponse } from "../api";
import type { LabChange } from "../data/labTransformations";

type WhatIfPanelProps = {
  title: string;
  originalValue: string;
  modifiedValue: string;
  options: LabChange[];
  selected?: LabChange;
  onApply: (change: LabChange) => void;
  onReset: () => void;
  experiment: WhatIfResponse | null;
  loading: boolean;
  error: string | null;
};

// These fields are not currently parsed separately by FastAPI.
const unavailableIds = new Set([
  "link-placeholder",
  "attachment-label",
  "signature-fictional",
]);

function signedPoints(value: number) {
  if (value > 0) return `+${value.toFixed(2)}`;
  if (value < 0) return `−${Math.abs(value).toFixed(2)}`;
  return "0.00";
}

function WhatIfPanel({
  title,
  originalValue,
  modifiedValue,
  options,
  selected,
  onApply,
  onReset,
  experiment,
  loading,
  error,
}: WhatIfPanelProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-[#e8ebf1] px-5 py-4">
        <span className="grid size-9 place-items-center rounded-xl bg-[#eeeafe] text-[#6c56bd]">
          <FlaskConical size={18} />
        </span>

        <div>
          <h2 className="text-sm font-bold text-[#202a44]">
            Try a safe change
          </h2>

          <p className="mt-1 text-[11px] text-[#8a92a4]">
            Selected: {title}
          </p>
        </div>
      </div>

      {/* Transformation options */}
      <div className="space-y-3 p-5">
        <p className="text-xs leading-5 text-[#7b8497]">
          Apply a predefined transformation to this isolated email copy.
        </p>

        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={
              loading ||
              unavailableIds.has(option.id)
            }
            onClick={() => onApply(option)}
            aria-pressed={selected?.id === option.id}
            className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-[#3157d5] disabled:cursor-not-allowed disabled:opacity-60 ${
              selected?.id === option.id
                ? "border-[#8097df] bg-[#f3f5ff]"
                : "border-[#e1e5eb] bg-white hover:border-[#bdc9e7]"
            }`}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold text-[#35415c]">
                {option.title}
              </span>

              {unavailableIds.has(option.id) && (
                <span className="rounded-full bg-[#f0f2f6] px-2 py-1 text-[9px] font-semibold text-[#788197]">
                  Coming later
                </span>
              )}

              {selected?.id === option.id && (
                <span className="rounded-full bg-[#e9f7f0] px-2 py-1 text-[9px] font-bold text-[#277c58]">
                  Applied
                </span>
              )}
            </span>

            <span className="mt-2 block text-[11px] leading-5 text-[#7b8497]">
              {option.description}
              {unavailableIds.has(option.id)
                ? " This component is not separately available in the current backend."
                : ""}
            </span>

            <span className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-md bg-[#f0f2f6] px-2 py-1 text-[9px] text-[#657087]">
                {option.kind}
              </span>

              <span className="rounded-md bg-[#eef2ff] px-2 py-1 text-[9px] text-[#3157d5]">
                {option.scope}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Original versus modified component */}
      <div className="border-t border-[#e8ebf1] bg-[#fafbfc] p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-[#35415c]">
            Component comparison
          </h3>

          {selected && (
            <button
              type="button"
              disabled={loading}
              onClick={onReset}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#3157d5] disabled:opacity-50"
            >
              <RotateCcw size={13} />
              Undo this change
            </button>
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#e1e6ee] bg-white p-3">
            <p className="mb-2 text-[10px] font-bold uppercase text-[#9299aa]">
              Original
            </p>

            <p className="break-words whitespace-pre-line text-xs leading-5 text-[#596579]">
              {originalValue}
            </p>
          </div>

          <div
            className={`rounded-xl border p-3 ${
              selected
                ? "border-[#cbd5f5] bg-[#f4f6ff]"
                : "border-[#e1e6ee] bg-white"
            }`}
          >
            <p className="mb-2 text-[10px] font-bold uppercase text-[#3157d5]">
              Modified copy
            </p>

            <p className="break-words whitespace-pre-line text-xs leading-5 text-[#35415c]">
              {modifiedValue}
            </p>
          </div>
        </div>

        {/* FastAPI model predictions */}
        <div
          className="mt-4 rounded-xl border border-[#dce3f5] bg-white p-4"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#35415c]">
              Detection comparison
            </h3>

            <span className="rounded-full bg-[#e9f7f0] px-2 py-1 text-[9px] font-bold uppercase text-[#277c58]">
              Real classifier
            </span>
          </div>

          {loading && (
            <p className="mt-4 flex items-center gap-2 text-xs text-[#657087]">
              <LoaderCircle
                size={14}
                className="animate-spin"
              />
              Running the trained model...
            </p>
          )}

          {error && (
            <p
              className="mt-4 rounded-lg bg-[#fff1f1] p-3 text-xs text-[#a33a3a]"
              role="alert"
            >
              {error}
            </p>
          )}

          {!loading && !experiment && !error && (
            <p className="mt-4 text-xs leading-5 text-[#7b8497]">
              Choose a transformation to run a real before-and-after prediction.
            </p>
          )}

          {experiment && (
            <>
              {(loading || error) && (
                <p className="mt-3 text-[10px] leading-5 text-[#657087]">
                  The comparison below is from the last successfully applied set of changes.
                </p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ScoreCard
                  label="Original malicious probability"
                  classification={
                    experiment.original_classification
                  }
                  confidence={
                    experiment.original_confidence
                  }
                  probability={
                    experiment.original_malicious_probability
                  }
                />

                <ScoreCard
                  label="Modified malicious probability"
                  classification={
                    experiment.modified_classification
                  }
                  confidence={
                    experiment.modified_confidence
                  }
                  probability={
                    experiment.modified_malicious_probability
                  }
                  modified
                />
              </div>

              <p className="mt-3 text-xs font-semibold text-[#35415c]">
                Difference:{" "}
                {signedPoints(experiment.score_change)}{" "}
                percentage points
              </p>

              <p className="mt-1 text-[10px] leading-5 text-[#657087]">
                Decision{" "}
                {experiment.decision_changed
                  ? "changed"
                  : "did not change"}
                .
              </p>

              {experiment.warnings.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 rounded-lg bg-[#fff8e8] p-3 pl-7 text-[10px] leading-5 text-[#805b16]">
                  {experiment.warnings.map((warning) => (
                    <li key={warning}>
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ScoreCard({
  label,
  classification,
  confidence,
  probability,
  modified = false,
}: {
  label: string;
  classification: string;
  confidence: number;
  probability: number;
  modified?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        modified
          ? "border-[#cbd5f5] bg-[#f4f6ff]"
          : "border-[#e1e6ee] bg-[#fafbfc]"
      }`}
    >
      <p className="text-[10px] font-semibold text-[#7b8497]">
        {label}
      </p>

      <p
        className={`mt-1 text-xl font-bold ${
          modified
            ? "text-[#3157d5]"
            : "text-[#26314c]"
        }`}
      >
        {probability.toFixed(2)}%
      </p>

      <p className="mt-1 text-[10px] text-[#657087]">
        {classification} · {confidence.toFixed(2)}% confidence
      </p>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5e9f1]">
        <div
          className={`h-full rounded-full ${
            modified
              ? "bg-[#3157d5]"
              : "bg-[#9ca5b8]"
          }`}
          style={{
            width: `${probability}%`,
          }}
        />
      </div>
    </div>
  );
}

export default WhatIfPanel;