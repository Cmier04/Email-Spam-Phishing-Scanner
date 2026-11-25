import { flushSync } from "react-dom";

// Crossfade only the visible header when changing pages/views.
// Fallback to immediate navigation in older browsers and Reduce Motion mode.
type CrossfadeDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

export function withHeaderCrossfade(update: () => void): void {
  const page = document as CrossfadeDocument;

  if (
    typeof page.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  // React must commit the new view before the browser captures its header.
  page.startViewTransition(() => {
    flushSync(update);
  });
}
