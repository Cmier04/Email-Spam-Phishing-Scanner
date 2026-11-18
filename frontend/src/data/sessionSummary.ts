
import type { WhatIfResponse } from "../api";
import type { LabChange } from "./labTransformations";

 // An isolated, one-change-at-a-time experiment compared against the same original email.
 // Differences are in percentage points of the model-estimated malicious probability.
export type IsolatedEffect = {
  changeId: string;
  part: LabChange["part"];
  label: string;
  originalProbability: number;
  modifiedProbability: number;
  difference: number;
};

export type FinalSessionSummary = {
  description: string;
  strongest: IsolatedEffect | null;
  strongestDescription: string;
  keyTakeaway: string;
  note: string;
};

function readableCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}


// Summarizes the session without claiming model attribution or causal explanation.
// // Only isolated, classifier-affecting edits are eligible for strongest-effect ranking.
export function buildFinalSessionSummary(
  testedChanges: LabChange[],
  individualEffects: Record<string, IsolatedEffect>,
  currentExperiment: WhatIfResponse | null,
  scoringInProgress: boolean,
): FinalSessionSummary {
  const distinctParts = new Set(testedChanges.map((change) => change.part));
  const effects = testedChanges
    .map((change) => individualEffects[change.id])
    .filter((effect): effect is IsolatedEffect => effect !== undefined);

  const distinctCount = distinctParts.size;
  const history = `You tested ${readableCount(distinctCount, "email characteristic")} using ${readableCount(testedChanges.length, "controlled change")}.`;

  const currentState = currentExperiment
    ? ` With the currently applied edits, the model-estimated malicious probability is ${currentExperiment.modified_malicious_probability.toFixed(2)}% (original: ${currentExperiment.original_malicious_probability.toFixed(2)}%), and the current classification is ${currentExperiment.modified_classification.toLowerCase()}.`
    : " The test copy is currently restored to its original state; your session history is still included here.";

  const strongest = effects.length > 0
    ? [...effects].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))[0]
    : null;

  let strongestDescription: string;
  if (strongest && Math.abs(strongest.difference) >= 0.005) {
    const direction = strongest.difference < 0 ? "decrease" : "increase";
    if (effects.length > 1) {
      strongestDescription = `Among the individually measured changes, “${strongest.label}” showed the largest observed ${direction} in malicious probability: ${Math.abs(strongest.difference).toFixed(2)} percentage points (${strongest.originalProbability.toFixed(2)}% → ${strongest.modifiedProbability.toFixed(2)}%).`;
    } else {
      strongestDescription = `Your one individually measured classifier-input change, “${strongest.label}”, showed a ${direction} of ${Math.abs(strongest.difference).toFixed(2)} percentage points (${strongest.originalProbability.toFixed(2)}% → ${strongest.modifiedProbability.toFixed(2)}%). Test another text change to compare effects.`;
    }
  } else if (effects.length > 0) {
    strongestDescription = "The classifier-input changes measured individually did not produce a meaningful difference at the displayed precision.";
  } else if (scoringInProgress) {
    strongestDescription = "Comparing each classifier-input change against the original email…";
  } else {
    strongestDescription = "No individual classifier-input comparison is available yet. Display-only changes such as sender labels, link labels, or spacing cannot be ranked by their effect on the current text classifier.";
  }

  const note = scoringInProgress
    ? "Some individual comparisons are still running; this ranking may update."
    : effects.length > 0
      ? `Compared ${readableCount(effects.length, "individually scored text change")} with the same original email. This ranks observed model responses, not proven causes or real-world phishing risk.`
      : "The current model evaluates subject/body text. It does not independently score sender-domain, link-label, attachment, or visual-only edits.";

  return {
    description: history + currentState,
    strongest,
    strongestDescription,
    keyTakeaway: distinctCount > 1
      ? "Do not rely on a single sign or one model score to decide whether an email is safe. Check the sender address, actual link destinations, message wording, requested action, and context together. Verify unexpected requests independently."
      : "One characteristic is only part of the picture. Check the sender, links, message content, and context together, and verify unexpected requests independently.",
    note,
  };
}
