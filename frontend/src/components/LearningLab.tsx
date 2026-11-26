
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Lightbulb,
  LockKeyhole,
  Menu,
  RotateCcw,
  ScanEye,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

import type { Email } from "../data/mockEmails";
import { runWhatIf, saveLabSession, getHistoryStatus, type WhatIfResponse, type LabSessionSnapshot } from "../api";
import { buildLearningSummary } from "../data/learningSummary";
import {
  buildFinalSessionSummary,
  type IsolatedEffect,
} from "../data/sessionSummary";
import {
  buildWhatIfRequest,
  getLabOptions,
  getOriginalPartValue,
  toApiPart,
  type EmailPart,
  type LabChange,
} from "../data/labTransformations";

import WhatIfPanel from "./WhatIfPanel";
import { FORCE_QWEN_CHANGED_EVENT, FORCE_QWEN_STORAGE_KEY, readForceQwenPreference } from "../data/forceQwenPreference";
import CrossfadeContent from "./CrossfadeContent";
import "../animations.css";

type LearningLabProps = {
  email: Email;
  active?: boolean;
  initialSession?: LabSessionSnapshot | null;
  onBack: () => void;
  onOpenMenu: () => void;
};

type LabStage = "explore" | "investigate" | "review";

const steps: {
  stage: LabStage;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    stage: "explore",
    title: "Explore",
    description: "Inspect the copy",
    icon: ScanEye,
  },
  {
    stage: "investigate",
    title: "Investigate",
    description: "Try a What-If",
    icon: FlaskConical,
  },
  {
    stage: "review",
    title: "Review",
    description: "View results",
    icon: ClipboardCheck,
  },
];

const learningContent: Record<
  EmailPart,
  {
    title: string;
    what: string;
    look: string;
    matter: string;
  }
> = {
  senderName: {
    title: "Sender display name",
    what: "The friendly name shown for a sender.",
    look: "Compare it with the actual sender address.",
    matter: "A familiar display name does not prove who sent an email.",
  },
  senderAddress: {
    title: "Sender email address",
    what: "The sender's address and domain.",
    look: "Notice unfamiliar domains and subtle misspellings.",
    matter: "The domain offers useful context but is not proof of authenticity.",
  },
  subject: {
    title: "Subject line",
    what: "A brief description of the message.",
    look: "Notice urgency, threats, or unusual deadlines.",
    matter: "A subject can pressure the recipient into acting quickly.",
  },
  greeting: {
    title: "Greeting",
    what: "The opening of the email.",
    look: "Check for incorrect names or unusual personalization.",
    matter: "Even personalized messages can be malicious.",
  },
  body: {
    title: "Message body",
    what: "The main content of the email.",
    look: "Look for unexpected requests for information or payment.",
    matter: "The wording may provide relevant signals to a text classifier.",
  },
  request: {
    title: "Requested action",
    what: "What the sender asks the recipient to do.",
    look: "Look for rushed decisions, passwords, or payment demands.",
    matter: "Unexpected requests should be verified independently.",
  },
  link: {
    title: "Link or action label",
    what: "The visible label for a link or button.",
    look: "Never assume its text is the real destination.",
    matter: "This lab displays inert text and does not open any URL.",
  },
  attachment: {
    title: "Attachment metadata",
    what: "An attached file's name or type.",
    look: "Check whether the file was expected.",
    matter: "A filename cannot establish whether a file is safe.",
  },
  signature: {
    title: "Email signature",
    what: "The claimed contact identity at the end of the email.",
    look: "Compare it with the sender and message context.",
    matter: "A professional-looking signature does not prove identity.",
  },
  formatting: {
    title: "Formatting and structure",
    what: "The spacing and organization of the email.",
    look: "Notice inconsistent spacing or unusual capitalization.",
    matter: "Spacing changes how an email looks, not what it says.",
  },
};

const partLabels: Record<EmailPart, string> = {
  senderName: "Sender name",
  senderAddress: "Sender address",
  subject: "Subject line",
  greeting: "Greeting",
  body: "Message body",
  request: "Requested action",
  link: "Link / action label",
  attachment: "Attachment filename",
  signature: "Signature",
  formatting: "Formatting",
};

const parts: EmailPart[] = [
  "senderName",
  "senderAddress",
  "subject",
  "greeting",
  "body",
  "request",
  "link",
  "attachment",
  "signature",
  "formatting",
];

// Email components that can change the subject/body input of the classifier.
const textInputParts: EmailPart[] = [
  "subject",
  "greeting",
  "body",
  "request",
];

function SelectableField({
  label,
  selected,
  modified,
  highlighted,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  modified: boolean;
  highlighted: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`block w-full min-w-0 rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-[#3157d5] ${
        highlighted ? "lab-field-flash" : ""
      } ${
        selected
          ? "border-[#8097df] bg-[#f2f5ff] shadow-sm"
          : "border-[#e5e9f0] bg-white hover:border-[#bdc9e7]"
      }`}
    >
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8b93a3]">
          {label}
        </span>

        {modified && (
          <span className="lab-modified-badge rounded-full bg-[#eeeafe] px-2 py-0.5 text-[9px] font-bold text-[#6c56bd]">
            Modified
          </span>
        )}
      </span>

      <CrossfadeContent
        as="span"
        changeKey={`${selected ? "selected" : "unselected"}:${String(children)}`}
        className="block min-w-0 whitespace-pre-line [overflow-wrap:anywhere] text-sm leading-6 text-[#35415c]"
      >
        {children}
      </CrossfadeContent>
    </button>
  );
}

function LearningLab({
  email,
  active = true,
  initialSession,
  onBack,
  onOpenMenu,
}: LearningLabProps) {
  const [selectedPart, setSelectedPart] =
    useState<EmailPart>(() => (initialSession?.selected_part as EmailPart) || "subject");

  // Only confirmed changes are stored; the original email prop never changes.
  const [changes, setChanges] = useState<
    Partial<Record<EmailPart, LabChange>>
  >(() => {
    const saved: Partial<Record<EmailPart, LabChange>> = {};
    for (const item of initialSession?.changes || []) {
      const part = item.part as EmailPart;
      const matched = getLabOptions(part, email).find(option => option.id === item.id);
      if (matched) saved[part] = matched;
    }
    return saved;
  });
  const [experiment, setExperiment] =
    useState<WhatIfResponse | null>(() => initialSession?.experiment || null);
  const [labSaveStatus, setLabSaveStatus] = useState<string | null>(null);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [experimentLoading, setExperimentLoading] =
    useState(false);
  const [experimentError, setExperimentError] =
    useState<string | null>(null);
  const [forceQwen, setForceQwen] = useState<boolean>(readForceQwenPreference);

  const [isolatedEffects, setIsolatedEffects] =
    useState<Record<string, IsolatedEffect>>({});
  const [scoringIds, setScoringIds] = useState<string[]>([]);
  const [showLearningSummary, setShowLearningSummary] =
    useState(false);

  // Visual feedback only; confirmed transformations stay controlled by FastAPI.
  const [recentlyChangedPart, setRecentlyChangedPart] =
    useState<EmailPart | null>(null);
  const [undoingPart, setUndoingPart] =
    useState<EmailPart | null>(null);
  const [summaryClosing, setSummaryClosing] =
    useState(false);

  useEffect(() => {
    getHistoryStatus().then(value => setHistoryEnabled(value.available && value.enabled)).catch(() => setHistoryEnabled(false));
  }, []);

  const requestSequence = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const scoreRequests = useRef<Map<string, AbortController>>(
    new Map()
  );
  const effectsCache =
    useRef<Record<string, IsolatedEffect>>({});
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const finishButtonRef =
    useRef<HTMLButtonElement | null>(null);
  const fieldFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover previews the destination section; clicking highlights it for one second.
  const [previewStage, setPreviewStage] =
    useState<LabStage | null>(null);
  const [suppressedPreview, setSuppressedPreview] =
    useState<LabStage | null>(null);
  const [highlightedStage, setHighlightedStage] =
    useState<LabStage | null>(null);
  const highlightTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRefs = useRef<Record<LabStage, HTMLElement | null>>({
    explore: null,
    investigate: null,
    review: null,
  });

  // A stable dismiss callback keeps the existing focus-trap effect mounted
  // until the popup is actually closed, including during its exit animation.
  const closeLearningSummary = useCallback(() => {
    if (summaryCloseTimer.current !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShowLearningSummary(false);
      return;
    }
    setSummaryClosing(true);
    summaryCloseTimer.current = setTimeout(() => {
      setShowLearningSummary(false);
      setSummaryClosing(false);
      summaryCloseTimer.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    const pendingScores = scoreRequests.current;
    return () => {
      inFlight.current?.abort();
      pendingScores.forEach((controller) => controller.abort());
      if (highlightTimer.current !== null) {
        clearTimeout(highlightTimer.current);
      }
      if (fieldFlashTimer.current !== null) clearTimeout(fieldFlashTimer.current);
      if (undoTimer.current !== null) clearTimeout(undoTimer.current);
      if (summaryCloseTimer.current !== null) clearTimeout(summaryCloseTimer.current);
    };
  }, []);

  // Keep the popup accessible: focus inside it, close on Escape,
  // prevent background scrolling, and return focus when dismissed.
  useEffect(() => {
    if (!showLearningSummary) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current
      ?.querySelector<HTMLButtonElement>(
        'button[aria-label="Close learning summary"]'
      )
      ?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLearningSummary();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      finishButtonRef.current?.focus();
    };
  }, [showLearningSummary, closeLearningSummary]);

  const appliedChanges = parts
    .map((part) => changes[part])
    .filter(
      (change): change is LabChange =>
        change !== undefined
    );

  const availableParts = parts.filter(
    (part) =>
      part === "formatting" ||
      getOriginalPartValue(email, part).trim().length > 0
  );

  const selectedContent = learningContent[selectedPart];
  const originalSelectedValue = getOriginalPartValue(
    email,
    selectedPart
  );
  const modifiedSelectedValue =
    experiment?.modified_values[toApiPart(selectedPart)] ??
    originalSelectedValue;
  const spacing =
    experiment?.modified_values.formatting ?? "normal";

  // These summaries describe the changes that are currently applied.
  // Undone transformations are deliberately excluded.
  const learningSummary = experiment && appliedChanges.length > 0
    ? buildLearningSummary(appliedChanges, experiment)
    : null;

  // Rank only independently measured differences from the ACTIVE modifications.
  const individuallyMeasured = appliedChanges
    .map((change) => isolatedEffects[change.id])
    .filter((value): value is IsolatedEffect => value !== undefined);
  const largestObserved = individuallyMeasured.length > 0
    ? [...individuallyMeasured].sort(
        (a, b) => Math.abs(b.difference) - Math.abs(a.difference),
      )[0]
    : null;
  const activeScoring = appliedChanges.some(
    (change) => scoringIds.includes(change.id)
  );

  // Preserve the original "What You Explored" wording, based only on active edits.
  const activeSummary = appliedChanges.length > 0
    ? buildFinalSessionSummary(appliedChanges, isolatedEffects, experiment, activeScoring)
    : null;

  // Preserve the original "Why It Mattered" explanation, limited to active edits.
  const activeParts = Array.from(new Set(appliedChanges.map((change) => change.part)));
  const changedText = activeParts.some((part) => textInputParts.includes(part));
  const changedDisplay = activeParts.some((part) => !textInputParts.includes(part));
  const changesWhyItMattered = changedText
    ? "Some edits changed the subject or body text that the classifier analyzes. The observed probability differences show how the model responded to those tests, but do not prove which exact phrase caused the result." +
      (changedDisplay
        ? " Other edits changed displayed information or formatting, which the current text classifier does not analyze independently."
        : "")
    : "You explored visible email characteristics that can matter to a person reviewing a message. The current classifier analyzes subject and body text, so display-only changes do not independently affect its model score.";

  const largestObservedText = largestObserved
    ? `“${largestObserved.label}” had the largest individually measured change: ${
        Math.abs(largestObserved.difference) < 0.005
          ? "0.00"
          : `${largestObserved.difference < 0 ? "−" : "+"}${Math.abs(largestObserved.difference).toFixed(2)}`
      } percentage points (${largestObserved.originalProbability.toFixed(2)}% → ${
        largestObserved.modifiedProbability.toFixed(2)
      }%). This compares the one edit against the original email, not its share of a combined score.`
    : activeScoring
      ? "Individual comparisons are still running. The result will appear when available."
      : "No independently measured text-score change is available for these edits. Display-only changes are not scored by the current text classifier.";

  function scoreLabel(change: LabChange): {
    value: string;
    detail: string;
  } {
    const effect = isolatedEffects[change.id];
    if (effect) {
      const delta = effect.difference;
      const rounded = Math.abs(delta) < 0.005
        ? "0.00"
        : `${delta < 0 ? "−" : "+"}${Math.abs(delta).toFixed(2)}`;
      return {
        value: `${rounded} pp`,
        detail: "Individual change vs. original",
      };
    }

    const applied = experiment?.applied_transformations.find(
      (item) =>
        item.transformation_id === change.id &&
        item.part === toApiPart(change.part),
    );
    if (applied?.applied && !applied.affects_classifier) {
      return {
        value: "Display only",
        detail: "Not scored by this classifier",
      };
    }
    if (scoringIds.includes(change.id)) {
      return {
        value: "Calculating...",
        detail: "Measuring this change independently",
      };
    }
    return {
      value: "Unavailable",
      detail: "Individual score not available",
    };
  }

  function sectionGlow(stage: LabStage): string {
    const showingPreview = previewStage === stage && suppressedPreview !== stage;
    return showingPreview || highlightedStage === stage
      ? "ring-2 ring-[#8097df] shadow-[0_0_26px_rgba(49,87,213,0.22)] border-[#8097df]"
      : "";
  }

  function jumpToStage(stage: LabStage) {
    setSuppressedPreview(stage);
    setHighlightedStage(stage);

    if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setHighlightedStage(null);
      highlightTimer.current = null;
    }, 1000);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stageRefs.current[stage]?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  function recordIsolatedResult(change: LabChange, result: WhatIfResponse) {
    const applied = result.applied_transformations.find(
      (item) => item.transformation_id === change.id && item.part === toApiPart(change.part),
    );
    // Metadata/visual changes do not affect the current subject/body classifier.
    if (!applied?.applied || !applied.affects_classifier) return;

    const effect: IsolatedEffect = {
      changeId: change.id,
      part: change.part,
      label: change.title,
      originalProbability: result.original_malicious_probability,
      modifiedProbability: result.modified_malicious_probability,
      difference: result.modified_malicious_probability - result.original_malicious_probability,
    };
    effectsCache.current = { ...effectsCache.current, [change.id]: effect };
    setIsolatedEffects((previous) => ({ ...previous, [change.id]: effect }));
  }

  function scoreChangesIndividually(
    nextApplied: LabChange[],
    result: WhatIfResponse
  ) {
    for (const change of nextApplied) {
      const accepted = result.applied_transformations.find(
        (item) => item.transformation_id === change.id && item.part === toApiPart(change.part),
      );
      if (!accepted?.applied || !accepted.affects_classifier) continue;
      if (effectsCache.current[change.id]) continue;

      // A single-edit response already IS an independent baseline comparison.
      if (nextApplied.length === 1) {
        recordIsolatedResult(change, result);
        continue;
      }
      if (scoreRequests.current.has(change.id)) continue;

      const controller = new AbortController();
      scoreRequests.current.set(change.id, controller);
      setScoringIds((previous) => [...previous, change.id]);
      void runWhatIf({ ...buildWhatIfRequest(email.id, [change]), include_summary: false, ai_mode: forceQwen ? "require_qwen" : "automatic" }, controller.signal)
        .then((isolated) => {
          if (!controller.signal.aborted) recordIsolatedResult(change, isolated);
        })
        .catch(() => {
          // Failed individual requests do not invalidate the confirmed main experiment.
          // No strongest effect is fabricated for changes without an isolated result.
        })
        .finally(() => {
          scoreRequests.current.delete(change.id);
          if (!controller.signal.aborted) {
            setScoringIds((previous) => previous.filter((id) => id !== change.id));
          }
        });
    }
  }

  const changeForceQwen = useCallback((enabled: boolean) => {
    // The mode affects generated text and independent scoring. Never keep
    // previously measured scores after switching mode.
    requestSequence.current += 1;
    inFlight.current?.abort();
    scoreRequests.current.forEach((controller) => controller.abort());
    scoreRequests.current.clear();
    effectsCache.current = {};
    setIsolatedEffects({});
    setScoringIds([]);
    setChanges({});
    setExperiment(null);
    setExperimentError(null);
    setExperimentLoading(false);
    setShowLearningSummary(false);
    setForceQwen(enabled);
  }, []);

  // Settings owns this preference; reset stale comparisons when it changes.
  // The storage event also covers changes from another browser tab.
  useEffect(() => {
    const synchronize = () => {
      const enabled = readForceQwenPreference();
      if (enabled !== forceQwen) changeForceQwen(enabled);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === FORCE_QWEN_STORAGE_KEY || event.key === null) synchronize();
    };
    window.addEventListener(FORCE_QWEN_CHANGED_EVENT, synchronize);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FORCE_QWEN_CHANGED_EVENT, synchronize);
      window.removeEventListener("storage", onStorage);
    };
  }, [forceQwen, changeForceQwen]);

  function flashChangedField(part?: EmailPart) {
    if (!part) return;
    if (fieldFlashTimer.current !== null) clearTimeout(fieldFlashTimer.current);
    setRecentlyChangedPart(part);
    fieldFlashTimer.current = setTimeout(() => {
      setRecentlyChangedPart(null);
      fieldFlashTimer.current = null;
    }, 850);
  }

  // Send the selected transformations to FastAPI.
  async function submitChanges(
    nextChanges: Partial<Record<EmailPart, LabChange>>,
    changedPart?: EmailPart
  ) {
    const requestId = ++requestSequence.current;
    inFlight.current?.abort();
    inFlight.current = null;

    const nextApplied = parts
      .map((part) => nextChanges[part])
      .filter(
      (change): change is LabChange =>
        change !== undefined
    );

    // No changes: return to the original version.
    if (nextApplied.length === 0) {
      setChanges({});
      setExperiment(null);
      setExperimentError(null);
      setExperimentLoading(false);
      setShowLearningSummary(false);
      flashChangedField(changedPart);
      return;
    }

    // Current FastAPI rejects a full-body edit combined with a greeting/request edit.
    if (
      nextApplied.some((change) => change.part === "body") &&
      nextApplied.some((change) => change.part === "greeting" || change.part === "request")
    ) {
      setExperimentError(
        "A whole-body edit cannot be combined with a greeting or requested-action edit. Undo the conflicting change first.",
      );
      setExperimentLoading(false);
      return;
    }

    const controller = new AbortController();
    inFlight.current = controller;
    setExperimentLoading(true);
    setExperimentError(null);

    try {
      const result = await runWhatIf(
        { ...buildWhatIfRequest(email.id, nextApplied), ai_mode: forceQwen ? "require_qwen" : "automatic" },
        controller.signal,
      );
      if (requestId !== requestSequence.current || controller.signal.aborted) return;

      // Only confirmed changes appear in Experiment Results and Learning Summary.
      const rejected = nextApplied.find((change) => {
        const response = result.applied_transformations.find(
          (item) => item.transformation_id === change.id && item.part === toApiPart(change.part),
        );
        return !response?.applied;
      });
      if (rejected) {
        const response = result.applied_transformations.find(
          (item) => item.transformation_id === rejected.id,
        );
        setExperimentError(response?.message ?? `The backend did not apply ${rejected.title}.`);
        return;
      }

      setChanges(nextChanges);
      setExperiment(result);
      setShowLearningSummary(false);
      if (historyEnabled) {
        setLabSaveStatus("Saving lab...");
        void saveLabSession({email, experiment: result,
          changes: nextApplied.map(item => ({part: item.part, id: item.id})), selected_part: selectedPart})
          .then(() => setLabSaveStatus("Saved to Lab History — you can continue later."))
          .catch(reason => setLabSaveStatus(reason instanceof Error ? reason.message : "Could not save Lab History."));
      }
      flashChangedField(changedPart);
      scoreChangesIndividually(nextApplied, result);
    } catch (error) {
      if (requestId !== requestSequence.current || controller.signal.aborted) return;
      setExperimentError(
        error instanceof Error ? error.message : "The experiment could not be run.",
      );
    } finally {
      if (requestId === requestSequence.current) {
        setExperimentLoading(false);
        inFlight.current = null;
      }
    }
  }

  function applyChange(change: LabChange) {
    if (undoingPart !== null) return;
    setRecentlyChangedPart(null);
    void submitChanges({ ...changes, [change.part]: change }, change.part);
  }

  function undoChange(part: EmailPart) {
    if (experimentLoading || undoingPart !== null || !changes[part]) return;
    const updated = { ...changes };
    delete updated[part];
    setRecentlyChangedPart(null);

    // Collapse the card first; retain confirmed data until FastAPI responds.
    // If the request fails, the same card animates back into view.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void submitChanges(updated, part);
      return;
    }

    setUndoingPart(part);
    undoTimer.current = setTimeout(() => {
      undoTimer.current = null;
      void submitChanges(updated, part).finally(() => {
        setUndoingPart(null);
      });
    }, 230);
  }

  function restoreAll() {
    if (undoTimer.current !== null) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    setUndoingPart(null);
    setRecentlyChangedPart(null);
    if (fieldFlashTimer.current !== null) clearTimeout(fieldFlashTimer.current);
    requestSequence.current += 1;
    inFlight.current?.abort();
    inFlight.current = null;
    setChanges({});
    setExperiment(null);
    setExperimentError(null);
    setExperimentLoading(false);
    setShowLearningSummary(false);
  }

  return (
    <>
      <header className={`${active ? "phishlab-topbar-enter" : ""} flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-[#e4e8ef] bg-white px-5 py-3 md:px-8`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open navigation menu"
            className="text-[#596579] lg:hidden"
          >
            <Menu size={20} />
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-semibold text-[#596579] hover:text-[#3157d5]"
          >
            <ArrowLeft size={17} />
            Back to analysis
          </button>
        </div>
        <div className="ml-auto flex shrink-0 rounded-lg bg-[#f0f2f6] p-1">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-[#788197]"
          >
            Original email
          </button>
          <span className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#3157d5] shadow-sm">
            <FlaskConical size={14} />
            Learning Lab
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] px-5 py-7 md:px-8">
        {/* Page introduction; the stage buttons begin at Explore. */}
        <div
          className={`${active ? "phishlab-lab-enter" : ""} mb-5 px-2`}
          style={{ animationDelay: "35ms" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-[#eeeafe] px-2 py-1 text-[10px] font-bold uppercase text-[#6c56bd]">
                  Interactive learning copy
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[#6c7487]">
                  <LockKeyhole size={12} />
                  Original is read-only
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#17213c]">
                Explore this email's components
              </h1>
              <p className="mt-2 text-sm text-[#788197]">
                Inspect the email, try controlled changes, and compare the classifier's response.
              </p>
            </div>
            {appliedChanges.length > 0 && (
              <button
                type="button"
                onClick={restoreAll}
                className="flex items-center gap-2 rounded-lg border border-[#dfe4eb] bg-white px-3.5 py-2 text-xs font-semibold text-[#3157d5] hover:bg-[#f5f7ff]"
              >
                <RotateCcw size={14} />
                Restore entire copy
              </button>
            )}
          </div>
        </div>

        {/* Interactive stage navigation: hover previews, click scrolls and flashes. */}
        <nav aria-label="Learning Lab stages" className="mb-5 grid gap-2 sm:grid-cols-3">
          {steps.map((step, index) => {
            const done = index === 0 || appliedChanges.length > 0;
            const StepIcon = step.icon;
            return (
              <button
                key={step.stage}
                type="button"
                aria-controls={`lab-${step.stage}`}
                onMouseEnter={() => setPreviewStage(step.stage)}
                onMouseLeave={() => {
                  setPreviewStage(null);
                  setSuppressedPreview(null);
                }}
                onFocus={() => setPreviewStage(step.stage)}
                onBlur={() => {
                  setPreviewStage(null);
                  setSuppressedPreview(null);
                }}
                onClick={() => jumpToStage(step.stage)}
                style={{ animationDelay: `${65 + index * 30}ms` }}
                className={`${active ? "phishlab-lab-enter" : ""} group rounded-xl border px-4 py-3 text-left transition-[box-shadow,border-color,background-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#8097df] hover:bg-[#f0f4ff] hover:shadow-[0_0_20px_rgba(49,87,213,0.25)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157d5] ${
                  done
                    ? "border-[#dce3f5] bg-[#f2f5ff] text-[#3157d5]"
                    : "border-[#e1e6ee] bg-white text-[#768197]"
                }`}
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <StepIcon
                    size={17}
                    className="shrink-0 text-[#3157d5]"
                    aria-hidden="true"
                  />
                  <span>{index + 1}. {step.title}</span>
                  <ArrowRight
                    size={13}
                    className="ml-auto opacity-40 transition-opacity group-hover:opacity-100"
                  />
                </span>
                <span className="mt-1 block text-[10px] font-medium opacity-70">
                  {step.description}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          {/* Stage 1: Explore the isolated email copy. */}
          <section
            id="lab-explore"
            ref={(node) => {
              stageRefs.current.explore = node;
            }}
            style={{ animationDelay: "150ms" }}
            className={`${active ? "phishlab-lab-enter" : ""} min-w-0 scroll-mt-6 overflow-hidden rounded-2xl border border-[#dfe4eb] bg-white shadow-sm transition-[box-shadow,border-color] duration-500 ${sectionGlow("explore")}`}
          >
            <div className="flex items-center justify-between border-b border-[#e8ebf1] bg-[#fafbfc] px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#8d95a6]">
                  Stage 1 · Explore
                </p>
                <p className="mt-1 text-[11px] text-[#a0a7b5]">
                  Choose an email component below
                </p>
              </div>
              <span className="rounded-full bg-[#e9f7f0] px-2.5 py-1 text-[10px] font-bold text-[#277c58]">
                SAFE PREVIEW
              </span>
            </div>
            <div
              className={
                spacing === "compact"
                  ? "phishlab-formatting-fields flex flex-col gap-1 p-3 md:p-4"
                  : spacing === "spacious"
                    ? "phishlab-formatting-fields flex flex-col gap-6 p-8 md:p-10"
                    : "phishlab-formatting-fields flex flex-col gap-3 p-5 md:p-6"
              }
            >
              {availableParts.map((part, index) => (
                <div
                  key={part}
                  className={active ? "phishlab-lab-enter" : ""}
                  style={{ animationDelay: `${185 + index * 17}ms` }}
                >
                  <SelectableField
                    label={partLabels[part]}
                    selected={selectedPart === part}
                    modified={Boolean(changes[part])}
                    highlighted={recentlyChangedPart === part}
                    onClick={() => setSelectedPart(part)}
                  >
                    {part === "formatting"
                      ? `Current layout: ${spacing}`
                      : experiment?.modified_values[toApiPart(part)] ??
                        getOriginalPartValue(email, part)}
                  </SelectableField>
                </div>
              ))}
            </div>
          </section>

          {/* Stage 2: Investigate with field guidance + real What-If requests. */}
          <section
            id="lab-investigate"
            ref={(node) => {
              stageRefs.current.investigate = node;
            }}
            style={{ animationDelay: "190ms" }}
            className={`${active ? "phishlab-lab-enter phishlab-lab-investigate" : ""} min-w-0 scroll-mt-6 space-y-5 rounded-2xl border border-transparent transition-[box-shadow,border-color] duration-500 ${sectionGlow("investigate")}`}
          >
            <div className="rounded-2xl border border-[#e1e6ee] bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c56bd]">
                Stage 2 · Investigate
              </p>
              {/* Keep the guidance height stable while the old and new text crossfade. */}
              <div className="grid">
                {/* Invisible copies reserve enough room for any available part.
                    This prevents shorter/longer explanations from shifting Stage 2. */}
                {availableParts.map((part) => (
                  <div
                    key={`guidance-size-${part}`}
                    aria-hidden="true"
                    className="invisible pointer-events-none col-start-1 row-start-1"
                  >
                    <GuidanceText part={part} />
                  </div>
                ))}

                <CrossfadeContent
                  changeKey={selectedPart}
                  className="col-start-1 row-start-1"
                >
                  <GuidanceText part={selectedPart} />
                </CrossfadeContent>
              </div>
            </div>
            <WhatIfPanel
              active={active}
              title={selectedContent.title}
              originalValue={originalSelectedValue}
              modifiedValue={modifiedSelectedValue}
              options={getLabOptions(selectedPart, email)}
              selected={changes[selectedPart]}
              onApply={applyChange}
              onReset={() => undoChange(selectedPart)}
              experiment={experiment}
              loading={experimentLoading || undoingPart !== null}
              error={experimentError}
            />
            <div className="flex gap-2 rounded-xl border border-[#e1e6ee] bg-white p-4">
              <ShieldCheck
                size={17}
                className="mt-0.5 shrink-0 text-[#2f9167]"
              />
              <p className="text-[11px] leading-5 text-[#7b8497]">
                This is a temporary copy. Your original email stays unchanged.
              </p>
            </div>
          </section>
        </div>

        {/* Stage 3: current experiment results only; lessons appear in the popup. */}
        <section
          id="lab-review"
          ref={(node) => {
            stageRefs.current.review = node;
          }}
          style={{ animationDelay: "315ms" }}
          className={`${active ? "phishlab-lab-enter phishlab-lab-review" : ""} mt-5 scroll-mt-6 rounded-2xl border border-[#dce3f5] bg-[#f9faff] p-5 shadow-sm transition-[box-shadow,border-color] duration-500 md:p-6 ${sectionGlow("review")}`}
          aria-label="Experiment results"
        >
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c56bd]">
              Stage 3 · Review
            </p>
            <h2 className="mt-1 text-base font-bold text-[#202a44]">
              Experiment Results
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#7b8497]">
              Review the edits you've applied. The model comparison is shown in What-If above.
            </p>
          </div>

          {(experimentLoading || experimentError) && appliedChanges.length > 0 && (
            <p className="mb-4 rounded-lg bg-[#fff8e8] px-3 py-2 text-[11px] text-[#805b16]">
              The edits below reflect the last successfully applied experiment.
            </p>
          )}

          {/* Each card represents one currently applied edit. The entire card undoes it. */}
          <div className="rounded-xl border border-[#e1e6ee] bg-white p-4">
            <h3 className="text-xs font-bold text-[#35415c]">
              Changes Made
            </h3>
            <p className="mt-1 text-[11px] leading-5 text-[#8a92a4]">
              <CrossfadeContent
                as="span"
                changeKey={appliedChanges.length}
              >
                {appliedChanges.length} currently applied
              </CrossfadeContent>
              {" · Score differences are in percentage points (pp), measured individually against the original."}
            </p>

            {appliedChanges.length > 0 ? (
              <div className="mt-3 space-y-2">
                {appliedChanges.map((change) => {
                  const score = scoreLabel(change);
                  return (
                    <div
                      key={change.part}
                      className={`lab-change-item ${
                        undoingPart === change.part ? "lab-change-item-exit" : ""
                      }`}
                    >
                      <div className="lab-change-item-inner">
                        <button
                          type="button"
                          disabled={experimentLoading || undoingPart !== null}
                          onClick={() => undoChange(change.part)}
                          aria-label={`Undo ${partLabels[change.part]}: ${change.title}. ${score.value}`}
                          title="Click anywhere to undo this change"
                          className="group flex w-full items-center justify-between gap-4 rounded-lg border border-[#e5e9f0] bg-white px-4 py-3 text-left transition-colors duration-150 hover:border-[#cbd2dc] hover:bg-[#f1f3f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157d5] disabled:cursor-wait disabled:opacity-60"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold leading-5 text-[#35415c]">
                              {partLabels[change.part]}: {change.title}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-[#8a92a4]">
                              {change.kind} · {change.scope}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <CrossfadeContent
                              as="span"
                              changeKey={score.value}
                              className="block text-sm font-bold tabular-nums text-[#3157d5]"
                            >
                              {score.value}
                            </CrossfadeContent>
                            <CrossfadeContent
                              as="span"
                              changeKey={score.detail}
                              className="block text-[10px] text-[#8a92a4]"
                            >
                              {score.detail}
                            </CrossfadeContent>
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#3157d5] group-hover:underline">
                              <RotateCcw size={12} aria-hidden="true" />
                              Undo
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-6 text-[#657087]">
                Choose an email component and apply a What-If change to review it here.
              </p>
            )}
          </div>

          {labSaveStatus && <p role="status" className="mb-3 text-[11px] text-[#596579]">{labSaveStatus}</p>}
          {!historyEnabled && <p className="mb-3 text-[11px] text-[#7b8497]">To resume this email later, enable Save Lab history in Settings → Data and privacy.</p>}
          {initialSession && <p className="mb-3 text-[11px] font-medium text-[#3157d5]">Resumed from Lab History. Existing edits and results are restored; new edits run another What-If comparison.</p>}
          {/* The learning summary uses only edits that are still applied. */}
          <div className="mt-5 border-t border-[#dfe4f3] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium text-[#657087]">
                Ready to see what these changes teach you?
              </p>
              <button
                ref={finishButtonRef}
                type="button"
                onClick={() => {
                  setSummaryClosing(false);
                  setShowLearningSummary(true);
                }}
                disabled={appliedChanges.length === 0 || experimentLoading || undoingPart !== null}
                aria-haspopup="dialog"
                className="flex items-center gap-2 rounded-lg bg-[#3157d5] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#2749bb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157d5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                View learning summary
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Only the currently applied transformations are included in this popup. */}
      {showLearningSummary && learningSummary && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Dismiss learning summary"
            onClick={closeLearningSummary}
            className={`lab-summary-backdrop absolute inset-0 cursor-default bg-[#17213c]/50 backdrop-blur-[6px] ${
              summaryClosing ? "lab-summary-backdrop-exit" : ""
            }`}
          />

          <div
            ref={dialogRef}
            id="lab-learning-summary"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-learning-summary-title"
            aria-describedby="lab-learning-summary-description"
            tabIndex={-1}
            className={`lab-summary-dialog relative z-10 max-h-[85vh] w-full max-w-[680px] overflow-y-auto rounded-2xl border border-[#e1e6ee] bg-white p-5 shadow-2xl outline-none sm:p-7 ${
              summaryClosing ? "lab-summary-dialog-exit" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef2ff] text-[#3157d5]">
                  <Sparkles size={20} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c56bd]">
                    Learning Lab complete
                  </p>
                  <h2
                    id="lab-learning-summary-title"
                    className="mt-1 text-xl font-bold text-[#202a44]"
                  >
                    Your Session Summary
                  </h2>
                  <p
                    id="lab-learning-summary-description"
                    className="mt-1 text-xs text-[#7b8497]"
                  >
                    Based on the changes currently applied to this email.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLearningSummary}
                aria-label="Close learning summary"
                className="rounded-lg p-2 text-[#7b8497] transition hover:bg-[#f2f4f8] hover:text-[#26314c] focus-visible:outline-2 focus-visible:outline-[#3157d5]"
              >
                <X size={20} />
              </button>
            </div>

            {/* The original popup's compact chip layout, using only currently applied edits. */}
            <section className="mt-5" aria-labelledby="lab-explored-heading">
              <h3 id="lab-explored-heading" className="text-xs font-bold text-[#35415c]">
                What You Explored
              </h3>
              <p className="mt-2 text-sm leading-7 text-[#5c6880]">
                {activeSummary?.description}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Applied email changes">
                {appliedChanges.map((change) => (
                  <li
                    key={change.part}
                    className="rounded-lg border border-[#e1e6ee] bg-[#f8f9fc] px-3 py-2 text-[11px] font-medium text-[#53617c]"
                  >
                    {partLabels[change.part]}: {change.title}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-4 rounded-xl border border-[#e3e9f7] bg-[#f7f9ff] p-4">
              <h3 className="text-xs font-bold text-[#35415c]">
                Most Influential Change
              </h3>
              <p className="mt-1 text-[11px] leading-5 text-[#7b8497]">
                Among the changes currently applied, measured separately against the original.
              </p>
              <p className="mt-2 text-xs leading-6 text-[#657087]">
                {largestObservedText}
              </p>
            </section>

            <section className="mt-5 rounded-xl border border-[#e1e6ee] bg-white p-4">
              <div className="flex items-center gap-2">
                <Lightbulb
                  size={17}
                  className="shrink-0 text-[#6c56bd]"
                  aria-hidden="true"
                />
                <h3 className="text-xs font-bold text-[#35415c]">
                  Why It Mattered
                </h3>
              </div>
              <p className="mt-2 text-xs leading-6 text-[#657087]">
                {changesWhyItMattered}
              </p>
            </section>

            <section className="mt-4 rounded-xl border border-[#dcecdf] bg-[#f7fcf8] p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  size={18}
                  className="shrink-0 text-[#2d9366]"
                  aria-hidden="true"
                />
                <h3 className="text-xs font-bold text-[#2f684c]">
                  What You Should Learn
                </h3>
              </div>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-6 text-[#5c6880]">
                {learningSummary.whatYouShouldLearn.map((takeaway, index) => (
                  <li key={`${index}-${takeaway}`}>{takeaway}</li>
                ))}
              </ul>
            </section>

            <p className="mt-4 text-[11px] leading-5 text-[#737d91]">
              {learningSummary.note}
            </p>

            <div className="mt-6 flex justify-end border-t border-[#edf0f4] pt-5">
              <button
                type="button"
                onClick={closeLearningSummary}
                className="rounded-lg bg-[#3157d5] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#2749bb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157d5]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

// Reuse the exact guidance layout for both the visible crossfade and the
// invisible height measurements, so the card never jumps between selections.
function GuidanceText({ part }: { part: EmailPart }) {
  const content = learningContent[part];

  return (
    <>
      <h2 className="mt-1 text-sm font-bold text-[#202a44]">
        {content.title}
      </h2>
      <div className="mt-4 space-y-4">
        <Info title="What is this?" value={content.what} />
        <Info title="What should I look for?" value={content.look} />
        <Info title="Why does it matter?" value={content.matter} />
      </div>
    </>
  );
}

function Info({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#4b5670]">
        {title}
      </p>

      <p className="mt-1 text-[11px] leading-5 text-[#7b8497]">
        {value}
      </p>
    </div>
  );
}

export default LearningLab;
