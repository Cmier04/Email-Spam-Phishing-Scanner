
import type { WhatIfResponse } from "../api";
import type { LabChange } from "./labTransformations";

type Lesson = {
  changed: string;
  takeaway: string;
  context: string;
};

const lessons: Record<string, Lesson> = {
  "subject-wording": {
    changed: "Replaced the urgent subject line with neutral wording.",
    takeaway: "Be cautious when an unexpected email pressures you to act immediately. Verify the request through an official website or trusted contact method.",
    context: "Urgency in a subject line can be a phishing warning sign.",
  },
  "subject-format": {
    changed: "Changed the subject line's capitalization.",
    takeaway: "Do not judge an email by capitalization alone. Review the sender, the actual request, and any suspicious links together.",
    context: "Presentation and capitalization can change without changing the message's meaning.",
  },
  "body-rephrase": {
    changed: "Replaced the full message body with a less urgent sample message.",
    takeaway: "Read the entire message for pressure, unexpected account requests, and instructions to disclose information. A polite tone does not guarantee safety.",
    context: "This edit replaced many words at once, so it cannot isolate which phrase influenced the model.",
  },
  "request-rephrase": {
    changed: "Reworded the requested action to remove immediate pressure.",
    takeaway: "Verify unexpected requests for account access, personal information, passwords, or payment independently before taking action.",
    context: "A rushed or unexpected request can be a phishing warning sign.",
  },
  "greeting-generic": {
    changed: "Replaced the greeting with a generic greeting.",
    takeaway: "A personalized greeting does not prove an email is legitimate, and a generic greeting alone does not prove it is malicious.",
    context: "Greeting wording can affect the words the classifier analyzes.",
  },
  "sender-label": {
    changed: "Changed the sender's display name in the test copy.",
    takeaway: "A familiar display name does not verify who sent an email. Inspect the sender address and verify unexpected requests separately.",
    context: "A sender display name is useful to inspect, but the current classifier does not analyze it.",
  },
  "sender-domain": {
    changed: "Changed the sender address to an example domain in the test copy.",
    takeaway: "Check the full sender address for unexpected domains or lookalike spelling. An address by itself is not proof of safety.",
    context: "The sender domain is a useful security clue, but the current classifier uses only the subject and message body.",
  },
  "link-placeholder": {
    changed: "Changed the displayed link label in the test copy.",
    takeaway: "Check where a link actually leads before opening it. A safe-looking label can conceal a different destination.",
    context: "Changing a link label alone does not verify the destination.",
  },
  "attachment-label": {
    changed: "Changed the attachment filename in the test copy.",
    takeaway: "Treat unexpected attachments cautiously. A filename or extension does not prove a file is safe.",
    context: "The classifier does not inspect attachment files in this experiment.",
  },
  "signature-fictional": {
    changed: "Changed the displayed signature in the test copy.",
    takeaway: "A professional signature is easy to imitate. Confirm the sender's identity using a trusted channel.",
    context: "The classifier does not separately analyze signature metadata in this experiment.",
  },
  "layout-spacing": {
    changed: "Increased the spacing of the test email.",
    takeaway: "Attractive formatting does not establish authenticity. Focus on the request and verify the sender independently.",
    context: "A visual-only edit does not change the words analyzed by this classifier.",
  },
  "layout-compact": {
    changed: "Made the test email's spacing more compact.",
    takeaway: "Formatting can affect how convincing a message looks, but it does not establish that an email is trustworthy.",
    context: "A visual-only edit does not change the words analyzed by this classifier.",
  },
};

export type PersonalizedLearningSummary = {
  changesMade: string[];
  originalProbability: string;
  modifiedProbability: string;
  probabilityDifference: string;
  originalClassification: string;
  modifiedClassification: string;
  decisionChanged: boolean;
  whyItMattered: string;
  whatYouShouldLearn: string[];
  isBackendExplanation: boolean;
  note: string;
};

export function buildLearningSummary(
  changes: LabChange[],
  response: WhatIfResponse,
): PersonalizedLearningSummary {
  const accepted = changes.filter((change) =>
    response.applied_transformations.some((applied) =>
      applied.applied && applied.transformation_id === change.id,
    ),
  );
  const backend = response.learning_summary;
  const changedClassifierInput = response.applied_transformations.some(
    (change) => change.applied && change.affects_classifier,
  );
  const delta = response.modified_malicious_probability - response.original_malicious_probability;
  const direction = Math.abs(delta) < 0.005
    ? "stayed the same at the displayed precision"
    : delta < 0
      ? "decreased"
      : "increased";
  const effect = `The model-estimated malicious probability ${direction} after these changes.`;

  const topics = accepted.map((change) => lessons[change.id] ?? {
    changed: change.title,
    takeaway: change.scope === "Message text"
      ? "Pay attention to pressure, unexpected requests, and context. A change in wording does not establish that an email is safe."
      : change.part === "link"
        ? "A link's visible label does not tell you where it leads. Navigate independently before trusting a request."
        : change.part === "attachment"
          ? "A filename alone cannot verify that an attachment is safe."
          : "Visual cues and sender details are helpful to inspect, but do not prove a message is trustworthy.",
    context: change.scope === "Message text"
      ? "Changes to the subject or body can influence the model's score, but no single word guarantees a result."
      : "This is a display-only comparison and does not independently change the classifier's text input.",
  });
  let explanation: string;
  if (!changedClassifierInput) {
    explanation = "These changes affected the email's displayed metadata or appearance, not the subject or body used by the current classifier. Its prediction therefore should not change from these edits alone.";
  } else if (accepted.filter((change) =>
    response.applied_transformations.some((item) =>
      item.transformation_id === change.id && item.affects_classifier,
    ),
  ).length > 1) {
    explanation = `${effect} Several text changes were applied together, so this experiment cannot tell which individual edit was responsible.`;
  } else {
    const topic = accepted.find((change) =>
      response.applied_transformations.some((item) =>
        item.transformation_id === change.id && item.affects_classifier,
      ),
    );
    explanation = `${effect} ${topic ? (lessons[topic.id]?.context ?? "The edited text is part of the classifier input.") : "The classifier input was changed."} This comparison does not establish which exact words caused the result.`;
  }

  const takeaways = Array.from(new Set(topics.map((topic) => topic?.takeaway).filter(
    (value): value is string => Boolean(value),
  )));
  if (accepted.length > 1) {
    takeaways.push("Consider several warning signs together instead of relying on a single clue or model score.");
  }

  const changeLabels = backend?.changes_made?.length
    ? backend.changes_made
    : accepted.map((change) => lessons[change.id]?.changed ?? change.title);

  return {
    changesMade: changeLabels,
    originalProbability: `${response.original_malicious_probability.toFixed(2)}%`,
    modifiedProbability: `${response.modified_malicious_probability.toFixed(2)}%`,
    probabilityDifference: `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta).toFixed(2)} percentage points`,
    originalClassification: response.original_classification,
    modifiedClassification: response.modified_classification,
    decisionChanged: response.decision_changed,
    whyItMattered: backend?.why_it_mattered || explanation,
    whatYouShouldLearn: backend?.what_you_should_learn
      ? [backend.what_you_should_learn]
      : takeaways.length > 0
        ? takeaways
        : ["Verify unexpected email requests independently before following instructions or sharing information."],
    isBackendExplanation: Boolean(backend),
    note: backend?.source === "local_ai"
      ? "AI-generated learning guidance. It may be incomplete; always review the original message and verify unexpected requests independently."
      : "Learning guidance based on your comparison. Detection results are estimates, not a guarantee that an email is safe or harmful.",
  };
}
