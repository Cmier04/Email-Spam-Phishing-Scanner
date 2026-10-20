
import {
  ArrowLeft,
  Menu,
  TriangleAlert,
  CircleCheck,
  FlaskConical,
  Flag,
  Paperclip,
} from "lucide-react";

import type { Email } from "../data/mockEmails";

type EmailDetailProps = {
  email: Email;
  onBack: () => void;
  onOpenMenu: () => void;
};

const toneStyles: Record<Email["tone"], string> = {
  blue: "bg-[#e8f0ff] text-[#315fbd]",
  red: "bg-[#ffe9e5] text-[#c84d3e]",
  violet: "bg-[#f0eafe] text-[#7050b6]",
  amber: "bg-[#fff0d9] text-[#a86115]",
  slate: "bg-[#edf0f4] text-[#485366]",
};

function EmailDetail({
  email,
  onBack,
  onOpenMenu,
}: EmailDetailProps) {
  const isThreat = email.classification === "Potential threat";

  return (
    <>
      {/* Header and back navigation */}
      <header className="flex min-h-[72px] items-center gap-3 border-b border-[#e4e8ef] bg-white px-5 md:px-8">
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
          Back to dashboard
        </button>
      </header>

      <div className="mx-auto max-w-[1120px] px-5 py-8 md:px-8">
        {/* Email title and classification */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#9299aa]">
              Email analysis
            </p>

            <h1 className="max-w-3xl text-2xl font-bold tracking-tight text-[#17213c]">
              {email.subject}
            </h1>
          </div>

          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              isThreat
                ? "bg-[#ffebe7] text-[#b8493b]"
                : "bg-[#e9f7f0] text-[#277c58]"
            }`}
          >
            {email.classification}
          </span>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.55fr_.85fr]">
          {/* Left column: email content */}
          <section className="rounded-2xl border border-[#e3e7ee] bg-white shadow-sm">
            <div className="border-b border-[#e8ebf1] p-6">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${toneStyles[email.tone]}`}
                >
                  {email.initials}
                </div>

                <div className="min-w-0">
                  <p className="font-semibold text-[#202a44]">
                    {email.sender}
                  </p>

                  <p className="mt-1 break-all text-xs text-[#7e879a]">
                    {email.email}
                  </p>

                  <p className="mt-1 text-xs text-[#9ba2b1]">
                    Example email · {email.time}
                  </p>
                </div>
              </div>
            </div>

            {/* Displayed message is read-only. */}
            <div className="p-6 md:p-8">
              <p className="mb-5 text-[15px] leading-7 text-[#39445d]">
                {email.greeting ?? "Hello,"}
              </p>

              <p className="mb-5 whitespace-pre-line text-[15px] leading-7 text-[#39445d]">
                {email.body ?? email.preview}
              </p>

              {email.request && (
                <p className="mb-5 text-[15px] leading-7 text-[#39445d]">
                  {email.request}
                </p>
              )}

              {/* Action labels are disabled. */}
              {email.actionLabel && (
                <div className="mb-5">
                  <button
                    type="button"
                    disabled
                    title="Example action only - no link will open"
                    className="cursor-not-allowed rounded-lg bg-[#3157d5] px-5 py-2.5 text-sm font-semibold text-white opacity-60"
                  >
                    {email.actionLabel}
                  </button>

                  <p className="mt-2 text-[10px] text-[#9299aa]">
                    Inactive example - no destination attached
                  </p>
                </div>
              )}

              {email.attachment && (
                <div className="mt-6 flex w-fit items-center gap-2 rounded-lg border border-[#e0e5ed] px-3 py-2 text-xs text-[#657087]">
                  <Paperclip size={15} />
                  {email.attachment}
                  <span className="text-[#9aa2b2]">
                    (metadata only)
                  </span>
                </div>
              )}

              {email.signature && (
                <p className="mt-6 text-xs leading-5 text-[#6f798d]">
                  {email.signature}
                </p>
              )}
            </div>
          </section>

          {/* Right column: assessment and guidance */}
          <div className="space-y-5">
            <section
              className={`rounded-2xl border p-6 ${
                isThreat
                  ? "border-[#f1d2cc] bg-[#fffafa]"
                  : "border-[#dcebe4] bg-[#fbfefc]"
              }`}
            >
              <div className="mb-4 flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    isThreat
                      ? "bg-[#ffe6e1] text-[#c44e40]"
                      : "bg-[#e4f5ec] text-[#2c8a61]"
                  }`}
                >
                  {isThreat ? (
                    <TriangleAlert size={19} />
                  ) : (
                    <CircleCheck size={19} />
                  )}
                </div>

                <div>
                  <p className="text-xs text-[#7b8497]">
                    Stored scan result
                  </p>

                  <p className="font-bold text-[#202a44]">
                    {email.classification}
                  </p>
                </div>
              </div>

              <p className="text-sm leading-6 text-[#596579]">
                {isThreat
                  ? "This message is labeled as a potential threat. Review unexpected requests carefully and verify them independently."
                  : "This message is labeled as legitimate. Always check unexpected requests, even when a message seems familiar."}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-[#e5e7eb] pt-4 text-xs">
                <span className="text-[#7c8495]">
                  Confidence
                </span>

                <span className="font-bold text-[#26314c]">
                  {email.confidence}%
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-[#7c8495]">
                  Risk
                </span>

                <span className="font-semibold text-[#26314c]">
                  {email.risk}
                </span>
              </div>
            </section>

            {/* Educational guidance (or preset recommendations), not verified findings */}
            <section className="rounded-2xl border border-[#e3e7ee] bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold text-[#202a44]">
                What to review
              </h2>

              <div className="space-y-5">
                <ReviewItem
                  title="Sender identity"
                  description="Compare the sender's email address with the organization they claim to represent."
                />

                <ReviewItem
                  title="Message wording"
                  description="Look for urgent deadlines, unusual payments, or requests for sensitive information."
                />

                <ReviewItem
                  title="Links and attachments"
                  description="Avoid opening unexpected links or files before independently verifying the message."
                />
              </div>

            </section>

            {/* Learning Lab will be implemented later. */}
            <section className="rounded-2xl border border-[#dce3f5] bg-[#f8f9ff] p-6">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8edff] text-[#3157d5]">
                  <FlaskConical size={19} />
                </div>

                <div>
                  <h2 className="text-sm font-bold text-[#202a44]">
                    Learn from this email
                  </h2>

                  <p className="text-[11px] text-[#7b8497]">
                    Interactive Learning Lab
                  </p>
                </div>
              </div>

              <p className="mb-4 text-xs leading-5 text-[#657087]">
                Explore individual email components and test
                hypothetical changes in a separate copy.
              </p>

              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-[#3157d5] py-2.5 text-xs font-semibold text-white opacity-60"
              >
                <FlaskConical size={15} />
                Start interactive lab
              </button>
            </section>

            {/* Feedback will be implemented later. */}
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-[#dfe3eb] bg-white py-3 text-sm font-semibold text-[#596579] opacity-60"
            >
              <Flag size={16} />
              Report incorrect classification
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ReviewItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <TriangleAlert
        size={16}
        className="mt-0.5 shrink-0 text-[#a9671e]"
      />

      <div>
        <p className="text-xs font-semibold text-[#35415c]">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-[#7b8497]">
          {description}
        </p>
      </div>
    </div>
  );
}

export default EmailDetail;
