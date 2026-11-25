
import { useEffect, useRef, useState } from "react";

type AnimatedNumberProps = {
  value: string | number;
  duration?: number;
};

// Animates only the displayed number. The original value remains the accessible label.
// Supports counts, percentages, and signed percentage-point differences.
function AnimatedNumber({ value, duration = 520 }: AnimatedNumberProps) {
  const text = String(value);
  const match = /^([+−-]?)([\d,]+(?:\.(\d+))?)(%?)$/.exec(text);
  const target = match
    ? Number(`${match[1] === "−" ? "-" : match[1]}${match[2].replace(/,/g, "")}`)
    : null;
  const decimals = match?.[3]?.length ?? 0;
  const suffix = match?.[4] ?? "";
  const showPlus = match?.[1] === "+";
  const useGrouping = match?.[2].includes(",") ?? false;

  const [displayed, setDisplayed] = useState(0);
  const displayedRef = useRef(0);

  useEffect(() => {
    if (target === null || !Number.isFinite(target)) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => {
        displayedRef.current = target;
        setDisplayed(target);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const from = displayedRef.current;
    const difference = target - from;
    if (difference === 0) return;

    let frame = 0;
    let start: number | null = null;
    function animate(time: number) {
      if (start === null) start = time;
      const fraction = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - fraction, 3);
      const next = from + difference * eased;
      displayedRef.current = next;
      setDisplayed(next);
      if (fraction < 1) frame = window.requestAnimationFrame(animate);
    }
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [target, duration]);

  if (!match || target === null || !Number.isFinite(target)) {
    return <>{text}</>;
  }

  const absoluteValue = Math.abs(displayed).toLocaleString(undefined, {
    useGrouping,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = displayed < 0 ? "−" : showPlus && target > 0 ? "+" : "";

  return (
    <span className="tabular-nums">
      <span aria-hidden="true">{sign}{absoluteValue}{suffix}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

export default AnimatedNumber;
