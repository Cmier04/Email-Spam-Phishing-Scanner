import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type CrossfadeContentProps = {
  changeKey: string | number;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  as?: "div" | "span";
};

// Crossfade the previous and current content.
function CrossfadeContent({
  changeKey,
  children,
  className = "",
  contentClassName = "",
  as: Tag = "div",
}: CrossfadeContentProps) {
  const lastContent = useRef({ changeKey, children });
  const [outgoing, setOutgoing] = useState<ReactNode | null>(null);
  const [revision, setRevision] = useState(0);

  useLayoutEffect(() => {
    if (lastContent.current.changeKey === changeKey) {
      lastContent.current.children = children;
      return;
    }

    const previous = lastContent.current.children;
    lastContent.current = { changeKey, children };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOutgoing(null);
      return;
    }

    setOutgoing(previous);
    setRevision((current) => current + 1);
    const timeout = window.setTimeout(() => setOutgoing(null), 190);
    return () => window.clearTimeout(timeout);
  }, [changeKey, children]);

  return (
    <Tag className={`phishlab-crossfade ${className}`}>
      {outgoing !== null && (
        <Tag
          aria-hidden="true"
          ref={(element) => {
            // Outgoing content is visual only, even when it contains buttons.
            if (element) element.inert = true;
          }}
          className={`phishlab-crossfade-outgoing ${contentClassName}`}
        >
          {outgoing}
        </Tag>
      )}
      <Tag
        key={revision}
        className={`${outgoing !== null ? "phishlab-crossfade-incoming" : ""} ${contentClassName}`}
      >
        {children}
      </Tag>
    </Tag>
  );
}

export default CrossfadeContent;
