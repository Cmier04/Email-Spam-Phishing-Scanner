import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  FlaskConical,
  LockKeyhole,
  Menu,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { Email } from "../data/mockEmails";
import {
  getLabOptions,
  getOriginalPartValue,
  type EmailPart,
  type LabChange,
} from "../data/labTransformations";
import WhatIfPanel from "./WhatIfPanel";
import { calculateDemoComparison } from "../data/demoScoring";

type LearningLabProps = {
  email: Email;
  onBack: () => void;
  onOpenMenu: () => void;
};

const learningContent: Record<EmailPart, { title: string; what: string; look: string; matter: string }> = {
  senderName: { title: "Sender display name", what: "The friendly name shown for a sender.", look: "Compare it with the actual sender address.", matter: "A familiar display name does not prove who sent an email." },
  senderAddress: { title: "Sender email address", what: "The sender's address and domain.", look: "Notice unfamiliar domains and subtle misspellings.", matter: "The domain offers useful context but is not proof of authenticity." },
  subject: { title: "Subject line", what: "A brief description of the message.", look: "Notice urgency, threats, or unusual deadlines.", matter: "A subject can pressure the recipient into acting quickly." },
  greeting: { title: "Greeting", what: "The opening of the email.", look: "Check for incorrect names or unusual personalization.", matter: "Even personalized messages can be malicious." },
  body: { title: "Message body", what: "The main content of the email.", look: "Look for unexpected requests for information or payment.", matter: "The wording may provide relevant signals to a text classifier." },
  request: { title: "Requested action", what: "What the sender asks the recipient to do.", look: "Look for rushed decisions, passwords, or payment demands.", matter: "Unexpected requests should be verified independently." },
  link: { title: "Link or action label", what: "The visible label for a link or button.", look: "Never assume its text is the real destination.", matter: "This lab displays inert text and does not open any URL." },
  attachment: { title: "Attachment metadata", what: "An attached file's name or type.", look: "Check whether the file was expected.", matter: "A filename cannot establish whether a file is safe." },
  signature: { title: "Email signature", what: "The claimed contact identity at the end of the email.", look: "Compare it with the sender and message context.", matter: "A professional-looking signature does not prove identity." },
  formatting: { title: "Formatting and structure", what: "The spacing and organization of the email.", look: "Notice inconsistent spacing or unusual capitalization.", matter: "Spacing changes how an email looks, not what it says." },
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
  "senderName", "senderAddress", "subject", "greeting", "body",
  "request", "link", "attachment", "signature", "formatting",
];

function SelectableField({ label, selected, modified, onClick, children }: {
  label: string;
  selected: boolean;
  modified: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`block w-full rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-[#3157d5] ${
        selected ? "border-[#8097df] bg-[#f2f5ff] shadow-sm" : "border-[#e5e9f0] bg-white hover:border-[#bdc9e7]"
      }`}
    >
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8b93a3]">{label}</span>
        {modified && <span className="rounded-full bg-[#eeeafe] px-2 py-0.5 text-[9px] font-bold text-[#6c56bd]">Modified</span>}
      </span>
      <span className="block whitespace-pre-line break-words text-sm leading-6 text-[#35415c]">{children}</span>
    </button>
  );
}

function LearningLab({ email, onBack, onOpenMenu }: LearningLabProps) {
  const [selectedPart, setSelectedPart] = useState<EmailPart>("senderName");

  // Stores only changed fields; the email prop remains untouched.
  const [changes, setChanges] = useState<Partial<Record<EmailPart, LabChange>>>({});
  const appliedChanges = parts
    .map((part) => changes[part])
    .filter((change): change is LabChange => change !== undefined);
  const availableParts = parts.filter((part) =>
    part === "formatting" || getOriginalPartValue(email, part).trim().length > 0
  );

  // Mocked data. Displayed suspicion scores are simulated, not model predictions.
  // No classifier runs here; the backend integrator will replace this calculation.
  const demoComparison = calculateDemoComparison(email, appliedChanges);
  const selectedContent = learningContent[selectedPart];
  const originalSelectedValue = getOriginalPartValue(email, selectedPart);
  const spacing = changes.formatting?.value ?? "normal";

  // Summarize the selected edits for learning only. These categories and
  // simulated score changes are not verified security findings.
  const changedPartNames = appliedChanges.map((change) => partLabels[change.part]);
  const changedMessageText = appliedChanges.some((change) => change.scope === "Message text");
  const changedMetadata = appliedChanges.some((change) => change.scope === "Metadata only");
  const changedFormatting = appliedChanges.some((change) => change.scope === "Visual only");
  const learningTakeaways = [
    ...(changedMessageText
      ? ["Email wording can affect how urgent or trustworthy a message feels. Always consider the full request and context."]
      : []),
    ...(changedMetadata
      ? ["Sender details, action labels, and filenames are clues to investigate, not proof that a message is genuine."]
      : []),
    ...(changedFormatting
      ? ["Formatting changes the appearance of an email without necessarily changing its message."]
      : []),
  ];

  function applyChange(change: LabChange) {
    // Replacing a change for the same field avoids accidental stacking.
    setChanges((previous) => ({ ...previous, [change.part]: change }));
  }

  function undoChange(part: EmailPart) {
    setChanges((previous) => {
      const updated = { ...previous };
      delete updated[part];
      return updated;
    });
  }

  function restoreAll() {
    setChanges({});
  }

  return (
    <>
      <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-[#e4e8ef] bg-white px-5 py-3 md:px-8">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onOpenMenu} aria-label="Open navigation menu" className="text-[#596579] lg:hidden"><Menu size={20}/></button>
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-[#596579] hover:text-[#3157d5]"><ArrowLeft size={17}/> Back to analysis</button>
        </div>
        <div className="ml-auto flex shrink-0 rounded-lg bg-[#f0f2f6] p-1">
          <button type="button" onClick={onBack} className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-[#788197]">Original email</button>
          <span className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#3157d5] shadow-sm"><FlaskConical size={14}/> Learning Lab</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] px-5 py-7 md:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-[#eeeafe] px-2 py-1 text-[10px] font-bold uppercase text-[#6c56bd]">Interactive learning copy</span>
              <span className="flex items-center gap-1 text-[10px] text-[#6c7487]"><LockKeyhole size={12}/> Original is read-only</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#17213c]">Explore this email's components</h1>
            <p className="mt-2 text-sm text-[#788197]">Select a region, inspect its meaning, and try controlled changes.</p>
          </div>
          {appliedChanges.length > 0 && (
            <button type="button" onClick={restoreAll} className="flex items-center gap-2 rounded-lg border border-[#dfe4eb] bg-white px-3.5 py-2 text-xs font-semibold text-[#3157d5]"><RotateCcw size={14}/> Restore entire copy</button>
          )}
        </div>

        <div className="mb-5 grid gap-2 sm:grid-cols-4">
          {[
            { title: "1. Understand", done: true },
            { title: "2. Explore", done: true },
            { title: "3. Investigate", done: appliedChanges.length > 0 },
            { title: "4. Review", done: appliedChanges.length > 0 },
          ].map((step) => (
            <div key={step.title} className={`rounded-xl border px-4 py-3 text-xs font-semibold ${step.done ? "border-[#dce3f5] bg-[#f2f5ff] text-[#3157d5]" : "border-[#e1e6ee] bg-white text-[#9299aa]"}`}>{step.title}</div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          {/* Left: temporary email copy; no real links or attachments are opened. */}
          <section className="overflow-hidden rounded-2xl border border-[#dfe4eb] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#e8ebf1] bg-[#fafbfc] px-5 py-4">
              <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#8d95a6]">Isolated test copy</p><p className="mt-1 text-[11px] text-[#a0a7b5]">Choose a component below</p></div>
              <span className="rounded-full bg-[#e9f7f0] px-2.5 py-1 text-[10px] font-bold text-[#277c58]">SAFE PREVIEW</span>
            </div>
            <div className={`${spacing === "compact" ? "space-y-1 p-3 md:p-4" : spacing === "spacious" ? "space-y-6 p-8 md:p-10" : "space-y-3 p-5 md:p-6"}`}>
              {availableParts.map((part) => (
                <SelectableField
                  key={part}
                  label={partLabels[part]}
                  selected={selectedPart === part}
                  modified={Boolean(changes[part])}
                  onClick={() => setSelectedPart(part)}
                >
                  {part === "formatting"
                    ? `Current layout: ${spacing}`
                    : changes[part]?.value ?? getOriginalPartValue(email, part)}
                </SelectableField>
              ))}
            </div>
          </section>

          {/* Right: explanations and transformations for the selected component. */}
          <div className="space-y-5">
            <section className="rounded-2xl border border-[#e1e6ee] bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c56bd]">Selected component</p>
              <h2 className="mt-1 text-sm font-bold text-[#202a44]">{selectedContent.title}</h2>
              <div className="mt-4 space-y-4">
                <Info title="What is this?" value={selectedContent.what}/>
                <Info title="What should I look for?" value={selectedContent.look}/>
                <Info title="Why does it matter?" value={selectedContent.matter}/>
              </div>
            </section>
            <WhatIfPanel
              title={selectedContent.title}
              originalValue={originalSelectedValue}
              options={getLabOptions(selectedPart, email)}
              selected={changes[selectedPart]}
              onApply={applyChange}
              onReset={() => undoChange(selectedPart)}
              demoComparison={demoComparison}
            />
            <div className="flex gap-2 rounded-xl border border-[#e1e6ee] bg-white p-4">
              <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#2f9167]"/>
              <p className="text-[11px] leading-5 text-[#7b8497]">This is a temporary copy. Your original email stays unchanged.</p>
            </div>
          </div>
        </div>

        {/* Review locally selected changes; scores are mocked simulated. */}
        {appliedChanges.length > 0 && (
          <section className="mt-5 rounded-2xl border border-[#e1e6ee] bg-white p-5 shadow-sm md:p-6">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c56bd]">Stage 4 · Review learning</p>
            <h2 className="mt-1 text-base font-bold text-[#202a44]">Session observations</h2>
            <p className="mt-1 text-xs text-[#8a92a4]">{appliedChanges.length} modified component{appliedChanges.length === 1 ? "" : "s"}.</p>
            <div className="mt-4 space-y-3">
              {appliedChanges.map((change) => (
                <div key={change.part} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8ebf0] p-4">
                  <div>
                    <p className="text-xs font-semibold text-[#35415c]">{learningContent[change.part].title}: {change.title}</p>
                    <p className="mt-1 text-[11px] text-[#7b8497]">{change.kind} · {change.scope}</p>
                  </div>
                  <button type="button" onClick={() => undoChange(change.part)} className="flex items-center gap-1 text-xs font-semibold text-[#3157d5]"><RotateCcw size={13}/> Undo</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bottom-of-page learning recap. This is educational guidance only;
            its numeric comparison uses preset demo adjustments, not ML inference. */}
        <section className="mt-5 rounded-2xl border border-[#dce3f5] bg-[#f8f9ff] p-5 shadow-sm md:p-6">
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c56bd]">
              Stage 4 · Reflect
            </p>
            <h2 className="mt-1 text-base font-bold text-[#202a44]">Learning summary</h2>
            <p className="mt-1 text-xs leading-5 text-[#7b8497]">
              {appliedChanges.length === 0
                ? "Try a What-If change to see what you learned from this email."
                : `You explored ${appliedChanges.length} email component${appliedChanges.length === 1 ? "" : "s"} in your temporary copy.`}
            </p>
          </div>

          {appliedChanges.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#e1e6ee] bg-white p-4">
                <h3 className="text-xs font-semibold text-[#35415c]">What you changed</h3>
                <p className="mt-2 text-xs leading-6 text-[#657087]">
                  {changedPartNames.join(", ")}
                </p>
                <p className="mt-3 text-[11px] text-[#8a92a4]">
                  Demo score: {demoComparison.originalScore}% → {demoComparison.modifiedScore}%
                  {` (${demoComparison.difference > 0 ? "+" : ""}${demoComparison.difference} points)`}
                </p>
              </div>
              <div className="rounded-xl border border-[#e1e6ee] bg-white p-4">
                <h3 className="text-xs font-semibold text-[#35415c]">Key takeaways</h3>
                <ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-[#657087]">
                  {learningTakeaways.map((takeaway) => (
                    <li key={takeaway}>{takeaway}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-[#e1e6ee] bg-white p-4 text-xs leading-6 text-[#657087]">
              Select a sender, subject, message, or another component above.
              Apply a change to see a personalized recap here.
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-[#737d91]">
            Remember: Verify unexpected requests using the official website or a trusted contact method, even if an email appears less suspicious.
          </p>
        </section>
      </div>
    </>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return <div><p className="text-[11px] font-semibold text-[#4b5670]">{title}</p><p className="mt-1 text-[11px] leading-5 text-[#7b8497]">{value}</p></div>;
}

export default LearningLab;
