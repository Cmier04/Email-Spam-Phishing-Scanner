
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlaskConical, LoaderCircle, RotateCcw } from "lucide-react";
import type { WhatIfResponse } from "../api";
import type { LabChange } from "../data/labTransformations";
import AnimatedNumber from "./AnimatedNumber";
import CrossfadeContent from "./CrossfadeContent";
import "../animations.css";

type WhatIfPanelProps = {
  active?: boolean;
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

// These transformations are registered by FastAPI but currently return
// an "unavailable" result because their metadata is not parsed separately.
const unavailableIds = new Set(["link-placeholder", "attachment-label", "signature-fictional"]);

function signedPoints(value: number) {
  if (value > 0) return `+${value.toFixed(2)}`;
  if (value < 0) return `−${Math.abs(value).toFixed(2)}`;
  return "0.00";
}

function WhatIfPanel({
  active = true,
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
  const heightRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Animate real content-size changes, including when new score cards appear.
  // The lab stays mounted while hidden; measure only when it is visible.
  useLayoutEffect(() => {
    const container = heightRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    if (!active) {
      container.style.height = "auto";
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      container.style.height = "auto";
      return;
    }

    const measure = () => {
      if (!content.getClientRects().length) return;
      const nextHeight = Math.ceil(content.getBoundingClientRect().height);
      const previous = parseFloat(container.style.height);
      if (!Number.isFinite(previous) || Math.abs(previous - nextHeight) >= 1) {
        container.style.height = `${nextHeight}px`;
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [active]);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm">
      <div ref={heightRef} className="phishlab-whatif-resize">
        <div ref={contentRef}>
      <div className="flex items-center gap-3 border-b border-[#e8ebf1] px-5 py-4">
        <span className="grid size-9 place-items-center rounded-xl bg-[#eeeafe] text-[#6c56bd]">
          <FlaskConical size={18} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-[#202a44]">Try a safe change</h2>
          <CrossfadeContent
            as="span"
            changeKey={title}
            className="mt-1 block text-[11px] text-[#8a92a4]"
          >
            Selected: {title}
          </CrossfadeContent>
        </div>
      </div>

      <div className="space-y-3 p-5">
        <p className="text-xs leading-5 text-[#7b8497]">
          Apply a predefined transformation to this isolated email copy.
        </p>
        <CrossfadeContent changeKey={title} contentClassName="space-y-3">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={loading || unavailableIds.has(option.id)}
            onClick={() => {
              if (selected?.id === option.id) {
                onReset();
              } else {
                onApply(option);
              }
            }}
            aria-pressed={selected?.id === option.id}
            className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-[#3157d5] disabled:cursor-not-allowed disabled:opacity-60 ${
              selected?.id === option.id
                ? "border-[#8097df] bg-[#f3f5ff]"
                : "border-[#e1e5eb] bg-white hover:border-[#bdc9e7]"
            }`}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold text-[#35415c]">{option.title}</span>
              {unavailableIds.has(option.id) && (
                <span className="rounded-full bg-[#f0f2f6] px-2 py-1 text-[9px] font-semibold text-[#788197]">Coming later</span>
              )}
              {selected?.id === option.id && (
                <span className="phishlab-whatif-applied rounded-full bg-[#e9f7f0] px-2 py-1 text-[9px] font-bold text-[#277c58]">Applied</span>
              )}
            </span>
            <span className="mt-2 block text-[11px] leading-5 text-[#7b8497]">{option.description}{unavailableIds.has(option.id) ? " This component is not separately available in the current backend." : ""}</span>
            <span className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-md bg-[#f0f2f6] px-2 py-1 text-[9px] text-[#657087]">{option.kind}</span>
              <span className="rounded-md bg-[#eef2ff] px-2 py-1 text-[9px] text-[#3157d5]">{option.scope}</span>
            </span>
          </button>
        ))}
        </CrossfadeContent>
      </div>

      <div className="border-t border-[#e8ebf1] bg-[#fafbfc] p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-[#35415c]">Component comparison</h3>
          {selected && (
            <button type="button" disabled={loading} onClick={onReset} className="flex items-center gap-1 text-[11px] font-semibold text-[#3157d5] disabled:opacity-50">
              <RotateCcw size={13} /> Undo this change
            </button>
          )}
        </div>
        <CrossfadeContent
          changeKey={`${title}:${originalValue}:${modifiedValue}`}
          className="mt-3"
          contentClassName="grid gap-3 sm:grid-cols-2"
        >
          <div className="rounded-xl border border-[#e1e6ee] bg-white p-3">
            <p className="mb-2 text-[10px] font-bold uppercase text-[#9299aa]">Original</p>
            <p className="break-words whitespace-pre-line text-xs leading-5 text-[#596579]">{originalValue}</p>
          </div>
          <div className={`rounded-xl border p-3 ${selected ? "border-[#cbd5f5] bg-[#f4f6ff]" : "border-[#e1e6ee] bg-white"}`}>
            <p className="mb-2 text-[10px] font-bold uppercase text-[#3157d5]">Modified copy</p>
            <p className="break-words whitespace-pre-line text-xs leading-5 text-[#35415c]">{modifiedValue}</p>
          </div>
        </CrossfadeContent>

        <div className="mt-4 rounded-xl border border-[#dce3f5] bg-white p-4" aria-live="polite" aria-busy={loading}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#35415c]">Detection comparison</h3>
            <span className="rounded-full bg-[#e9f7f0] px-2 py-1 text-[9px] font-bold uppercase text-[#277c58]">
              Real classifier
            </span>
          </div>

          {error && <p className="mt-4 rounded-lg bg-[#fff1f1] p-3 text-xs text-[#a33a3a]" role="alert">{error}</p>}
          {!loading && !experiment && !error && (
            <p className="mt-4 text-xs leading-5 text-[#7b8497]">Choose a transformation to run a real before-and-after prediction.</p>
          )}
          {experiment && (
            <>
              <div className="phishlab-score-cards-enter mt-4 grid gap-3 sm:grid-cols-2">
                <ScoreCard label="Original malicious probability" classification={experiment.original_classification} confidence={experiment.original_confidence} probability={experiment.original_malicious_probability} />
                <ScoreCard label="Modified malicious probability" classification={experiment.modified_classification} confidence={experiment.modified_confidence} probability={experiment.modified_malicious_probability} modified />
              </div>
              <p className="phishlab-score-difference-enter mt-3 text-xs font-semibold text-[#35415c]">
                Difference: <AnimatedNumber value={signedPoints(experiment.score_change)} /> percentage points
              </p>
            </>
          )}
          <CrossfadeContent
            changeKey={loading ? "loading" : experiment ? `decision-${experiment.decision_changed}` : "idle"}
          >
          {loading ? (
            <div className="mt-3" role="status">
              <p className="flex items-center gap-2 text-[10px] leading-5 text-[#657087]">
                <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />
                Running the trained model...
              </p>
              {/* Indeterminate activity, not a simulated probability. */}
              <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-[#e5e9f1]">
                <div className="phishlab-classifier-loading h-full w-1/3 rounded-full bg-[#9bb0ee]" />
              </div>
            </div>
          ) : experiment ? (
            <p className="mt-1 text-[10px] leading-5 text-[#657087]">
              Decision {experiment.decision_changed ? "changed" : "did not change"}.
            </p>
          ) : null}
          </CrossfadeContent>
          {experiment && experiment.warnings.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 rounded-lg bg-[#fff8e8] p-3 pl-7 text-[10px] leading-5 text-[#805b16]">
              {experiment.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
        </div>
      </div>
        </div>
      </div>
    </section>
  );
}

// Animate the displayed number only when FastAPI returns a different score.
// Initial results display immediately; subsequent results interpolate from the
// last displayed number rather than starting from an invented value.
function useAnimatedProbability(probability: number) {
  const [displayed, setDisplayed] = useState(probability);
  const displayedRef = useRef(probability);

  useEffect(() => {
    let frame = 0;
    const from = displayedRef.current;
    const to = probability;
    if (from === to) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame = window.requestAnimationFrame(() => {
        displayedRef.current = to;
        setDisplayed(to);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    let startTime: number | null = null;
    const duration = 550;

    function tick(timestamp: number) {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (to - from) * eased;
      displayedRef.current = next;
      setDisplayed(next);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    }

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [probability]);

  return displayed;
}

function ScoreCard({ label, classification, confidence, probability, modified = false }: {
  label: string;
  classification: string;
  confidence: number;
  probability: number;
  modified?: boolean;
}) {
  const displayedProbability = useAnimatedProbability(probability);
  const boundedProbability = Math.max(0, Math.min(100, probability));

  return (
    <div className={`rounded-lg border p-3 ${modified ? "border-[#cbd5f5] bg-[#f4f6ff]" : "border-[#e1e6ee] bg-[#fafbfc]"}`}>
      <p className="text-[10px] font-semibold text-[#7b8497]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${modified ? "text-[#3157d5]" : "text-[#26314c]"}`}>
        <span aria-hidden="true">{displayedProbability.toFixed(2)}%</span>
        <span className="sr-only">{probability.toFixed(2)}%</span>
      </p>
      <p className="mt-1 text-[10px] text-[#657087]">{classification} · {confidence.toFixed(2)}% confidence</p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5e9f1]"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={boundedProbability}
      >
        <div
          className={`phishlab-score-fill h-full rounded-full ${modified ? "bg-[#3157d5]" : "bg-[#9ca5b8]"}`}
          style={{ width: `${boundedProbability}%` }}
        />
      </div>
    </div>
  );
}

export default WhatIfPanel;
