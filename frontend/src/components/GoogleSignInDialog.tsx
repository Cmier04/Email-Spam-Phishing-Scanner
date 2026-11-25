import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, X } from "lucide-react";

type GoogleCredentialResponse = { credential: string };
type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      theme: "outline";
      size: "large";
      shape: "rectangular";
      text: "signin_with";
      width: number;
    }
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

type GoogleSignInDialogProps = {
  clientId: string | null;
  onCredential: (credential: string) => Promise<void>;
  onContinueAsGuest: () => void;
  error: string | null;
  busy: boolean;
  closing: boolean;
};

function GoogleSignInDialog({
  clientId,
  onCredential,
  onContinueAsGuest,
  error,
  busy,
  closing,
}: GoogleSignInDialogProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const guestButtonRef = useRef<HTMLButtonElement | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);

  useEffect(() => {
    // Match the Learning Lab summary: prevent scrolling and restore focus.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    guestButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    function render() {
      if (cancelled || !window.google || !buttonRef.current) return;
      buttonRef.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId!,
        auto_select: false,
        callback: ({ credential }) => {
          if (!cancelled && credential) void onCredential(credential);
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "signin_with",
        width: 300,
      });
    }

    if (window.google?.accounts?.id) {
      render();
      return () => { cancelled = true; };
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-phishlab-google-signin="true"]'
    );
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", render);
    const handleError = () => {
      if (!cancelled) setScriptError("Google sign-in could not load. Please try again later.");
    };
    script.addEventListener("error", handleError);
    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.dataset.phishlabGoogleSignin = "true";
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      script.removeEventListener("load", render);
      script.removeEventListener("error", handleError);
    };
  }, [clientId, onCredential]);

  return createPortal(
    <div
      className={`phishlab-auth-backdrop fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-[#17213c]/40 px-4 py-8 backdrop-blur-[8px] sm:items-center ${
        closing ? "phishlab-auth-backdrop-exit" : ""
      }`}
      onMouseDown={(event) => {
        // The modal behaves like the Learning Lab summary when the backdrop is clicked.
        if (event.target === event.currentTarget && !busy && !closing) {
          onContinueAsGuest();
        }
      }}
      onKeyDown={(event) => {
        if (closing) return;
        if (event.key === "Escape" && !busy) onContinueAsGuest();
        if (event.key === "Tab") {
          const root = event.currentTarget;
          const focusable = Array.from(
            root.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [tabindex]:not([tabindex="-1"]), iframe'
            )
          );
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="phishlab-sign-in-title"
        aria-describedby="phishlab-sign-in-description"
        className={`phishlab-auth-dialog relative my-auto w-full max-w-[420px] rounded-2xl border border-[#e4e8ef] bg-white p-7 shadow-[0_24px_70px_rgba(15,25,50,0.28)] sm:p-8 ${
          closing ? "phishlab-auth-dialog-exit" : ""
        }`}
      >
        <button
          type="button"
          aria-label="Continue as a guest"
          onClick={onContinueAsGuest}
          disabled={busy}
          className="absolute right-4 top-4 rounded-lg p-2 text-[#8a92a4] transition hover:bg-[#f5f7fb] hover:text-[#3157d5] disabled:opacity-50"
        >
          <X size={17} />
        </button>

        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef2ff] text-[#3157d5]">
          <ShieldCheck size={27} aria-hidden="true" />
        </div>
        <h2 id="phishlab-sign-in-title" className="text-[23px] font-bold tracking-tight text-[#17213c]">
          Welcome to PhishLab
        </h2>
        <p id="phishlab-sign-in-description" className="mt-2 text-sm leading-6 text-[#788197]">
          Sign in with your Google account to identify yourself, or continue exploring the demo.
        </p>

        <div className="mt-7 flex min-h-[45px] items-center justify-center">
          {clientId ? (
            <div
              ref={buttonRef}
              aria-label="Sign in with Google"
              className={busy ? "pointer-events-none opacity-60" : ""}
            />
          ) : (
            <p className="rounded-lg bg-[#f6f8fb] px-4 py-3 text-center text-xs leading-5 text-[#788197]">
              Google sign-in is not configured on this backend yet.
              You can continue in demo mode.
            </p>
          )}
        </div>

        {busy && (
          <p role="status" className="mt-3 text-center text-xs text-[#596579]">
            Verifying your Google account...
          </p>
        )}
        {(error || scriptError) && (
          <p role="alert" className="mt-4 rounded-lg bg-[#fff1f1] p-3 text-xs leading-5 text-[#ab3f3f]">
            {error || scriptError}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3 text-[10px] text-[#a1a8b8]">
          <span className="h-px flex-1 bg-[#e4e8ef]" />
          or
          <span className="h-px flex-1 bg-[#e4e8ef]" />
        </div>

        <button
          ref={guestButtonRef}
          type="button"
          disabled={busy}
          onClick={onContinueAsGuest}
          className="mt-5 w-full rounded-lg border border-[#dce2ec] bg-white px-4 py-3 text-xs font-semibold text-[#35415c] transition hover:bg-[#f5f7fb] disabled:opacity-50"
        >
          Continue in demo mode
        </button>
        <p className="mt-5 text-center text-[11px] leading-5 text-[#9299aa]">
          Google sign-in does not connect your Gmail inbox or grant access to emails.
        </p>
      </section>
    </div>,
    document.body
  );
}

export default GoogleSignInDialog;
