
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Menu,
  RefreshCw,
} from "lucide-react";

type HeaderProps = {
  onOpenMenu: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

function Header({
  onOpenMenu,
  loading,
  error,
  onRetry,
}: HeaderProps) {
  // Any failed dashboard API request enables the retry button.
  const connectionFailed = Boolean(error);

  return (
    <header className="flex h-[72px] items-center justify-between border-b border-[#e4e8ef] bg-white px-5 md:px-8">
      <div className="flex items-center gap-3">
        {/* Mobile navigation */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="text-[#596579] lg:hidden"
        >
          <Menu size={22} />
        </button>

        <div>
          <h1 className="text-base font-bold text-[#202a44]">
            Dashboard
          </h1>

          <p className="hidden text-[11px] text-[#9299aa] sm:block">
            Monitor and protect your inbox
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Connection status */}
        <div
          role="status"
          className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs md:flex ${
            connectionFailed
              ? "border-[#f1c9c9] bg-[#fff4f4] text-[#c03939]"
              : loading
                ? "border-[#e0e5ed] text-[#626d82]"
                : "border-[#d8ebdf] bg-[#f4fbf6] text-[#277c58]"
          }`}
        >
          {connectionFailed ? (
            <AlertCircle size={14} />
          ) : loading ? (
            <LoaderCircle
              size={14}
              className="animate-spin"
            />
          ) : (
            <CheckCircle2 size={14} />
          )}

          <span>
            {connectionFailed
              ? "Connection failed"
              : loading
                ? "Connecting..."
                : "FastAPI connected"}
          </span>
        </div>

        {/* Turns red and becomes clickable if the API fails. */}
        <button
          type="button"
          onClick={onRetry}
          disabled={!connectionFailed || loading}
          title={
            error ??
            (loading
              ? "Connecting to FastAPI"
              : "Gmail scanning is not available yet")
          }
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition ${
            connectionFailed
              ? "bg-[#c63d3d] hover:bg-[#a92c2c]"
              : loading
                ? "cursor-wait bg-[#8294c9]"
                : "cursor-not-allowed bg-[#3157d5] opacity-60"
          }`}
        >
          {loading ? (
            <LoaderCircle
              size={14}
              className="animate-spin"
            />
          ) : (
            <RefreshCw size={14} />
          )}

          <span>
            {connectionFailed
              ? "Retry connection"
              : loading
                ? "Connecting..."
                : "Scan emails"}
          </span>
        </button>
      </div>
    </header>
  );
}

export default Header;
