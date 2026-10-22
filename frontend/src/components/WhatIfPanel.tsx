import { FlaskConical, RotateCcw } from "lucide-react";
import type { LabChange } from "../data/labTransformations";
import type { DemoComparison } from "../data/demoScoring";

type WhatIfPanelProps = {
  title: string;
  originalValue: string;
  options: LabChange[];
  selected?: LabChange;
  onApply: (change: LabChange) => void;
  onReset: () => void;
  demoComparison: DemoComparison;
};

function WhatIfPanel({
  title,
  originalValue,
  options,
  selected,
  onApply,
  onReset,
  demoComparison,
}: WhatIfPanelProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-[#e8ebf1] px-5 py-4">
        <span className="grid size-9 place-items-center rounded-xl bg-[#eeeafe] text-[#6c56bd]">
          <FlaskConical size={18} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-[#202a44]">Try a safe change</h2>
          <p className="mt-1 text-[11px] text-[#8a92a4]">Selected: {title}</p>
        </div>
      </div>

      <div className="space-y-3 p-5">
        <p className="text-xs leading-5 text-[#7b8497]">
          Apply a predefined transformation to this isolated email copy.
        </p>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onApply(option)}
            aria-pressed={selected?.id === option.id}
            className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-[#3157d5] ${
              selected?.id === option.id
                ? "border-[#8097df] bg-[#f3f5ff]"
                : "border-[#e1e5eb] bg-white hover:border-[#bdc9e7]"
            }`}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold text-[#35415c]">{option.title}</span>
              {selected?.id === option.id && (
                <span className="rounded-full bg-[#e9f7f0] px-2 py-1 text-[9px] font-bold text-[#277c58]">Applied</span>
              )}
            </span>
            <span className="mt-2 block text-[11px] leading-5 text-[#7b8497]">{option.description}</span>
            <span className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-md bg-[#f0f2f6] px-2 py-1 text-[9px] text-[#657087]">{option.kind}</span>
              <span className="rounded-md bg-[#eef2ff] px-2 py-1 text-[9px] text-[#3157d5]">{option.scope}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-[#e8ebf1] bg-[#fafbfc] p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-[#35415c]">Component comparison</h3>
          {selected && (
            <button type="button" onClick={onReset} className="flex items-center gap-1 text-[11px] font-semibold text-[#3157d5]">
              <RotateCcw size={13} /> Undo this change
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#e1e6ee] bg-white p-3">
            <p className="mb-2 text-[10px] font-bold uppercase text-[#9299aa]">Original</p>
            <p className="break-words whitespace-pre-line text-xs leading-5 text-[#596579]">{originalValue}</p>
          </div>
          <div className={`rounded-xl border p-3 ${selected ? "border-[#cbd5f5] bg-[#f4f6ff]" : "border-[#e1e6ee] bg-white"}`}>
            <p className="mb-2 text-[10px] font-bold uppercase text-[#3157d5]">Modified copy</p>
            <p className="break-words whitespace-pre-line text-xs leading-5 text-[#35415c]">{selected?.value ?? originalValue}</p>
          </div>
        </div>
        {/* Mockdata. Displayed scores are simulated, not predictions from the classifier. */}
        {/* Visual-only edits have no preset score effect; real scoring needs backend inference. */}
        <div className="mt-4 rounded-xl border border-[#dce3f5] bg-white p-4" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#35415c]">Detection comparison</h3>
            <span className="rounded-full bg-[#fff2d9] px-2 py-1 text-[9px] font-bold uppercase text-[#95611b]">
              Demo simulation
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#e1e6ee] bg-[#fafbfc] p-3">
              <p className="text-[10px] font-semibold text-[#7b8497]">Original sample score</p>
              <p className="mt-1 text-xl font-bold text-[#26314c]">
                {demoComparison.originalScore}%
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5e9f1]">
                <div className="h-full rounded-full bg-[#9ca5b8]" style={{ width: `${demoComparison.originalScore}%` }} />
              </div>
            </div>
            <div className="rounded-lg border border-[#cbd5f5] bg-[#f4f6ff] p-3">
              <p className="text-[10px] font-semibold text-[#6476aa]">Modified simulated score</p>
              <p className="mt-1 text-xl font-bold text-[#3157d5]">
                {demoComparison.modifiedScore}%
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e0e6fa]">
                <div className="h-full rounded-full bg-[#3157d5]" style={{ width: `${demoComparison.modifiedScore}%` }} />
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs font-semibold text-[#35415c]">
            Difference: {demoComparison.difference > 0 ? "+" : demoComparison.difference < 0 ? "−" : ""}
            {Math.abs(demoComparison.difference)} percentage points
          </p>
          <p className="mt-1 text-[10px] leading-5 text-[#8a92a4]">
            {demoComparison.changedCount} applied change{demoComparison.changedCount === 1 ? "" : "s"}.
          </p>
        </div>
      </div>
    </section>
  );
}

export default WhatIfPanel;
