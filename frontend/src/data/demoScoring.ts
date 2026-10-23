import type { Email } from "./mockEmails";
import type { LabChange } from "./labTransformations";

// These can be replaced by FastAPI responses during backend integration.
const demoPointChanges: Record<string, number> = {
  "sender-label": -2,
  "sender-domain": -7,
  "subject-format": 0,
  "subject-wording": -9,
  "greeting-generic": 0,
  "body-rephrase": -7,
  "request-rephrase": -8,
  "link-placeholder": -4,
  "attachment-label": 0,
  "signature-fictional": -2,
  "layout-spacing": 0,
  "layout-compact": 0,
};

export type DemoComparison = {
  originalScore: number;
  modifiedScore: number;
  difference: number;
  changedCount: number;
};

export function calculateDemoComparison(
  email: Email,
  appliedChanges: LabChange[]
): DemoComparison {
  // Convert it to a common "suspicion" scale for side-by-side comparison.
  const originalScore = Math.max(
    0,
    Math.min(
      100,
      email.classification === "Potential threat"
        ? email.confidence
        : 100 - email.confidence
    )
  );

  // Each selected transformation has a fixed illustrative effect.
  const totalAdjustment = appliedChanges.reduce(
    (total, change) => total + (demoPointChanges[change.id] ?? 0),
    0
  );

  const modifiedScore = Math.max(
    0,
    Math.min(100, originalScore + totalAdjustment)
  );

  return {
    originalScore,
    modifiedScore,
    difference: modifiedScore - originalScore,
    changedCount: appliedChanges.length,
  };
}
