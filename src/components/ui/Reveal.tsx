import React, { useEffect, useRef, useState } from 'react';

/**
 * Reveal — viewport-based scroll reveal primitive.
 *
 * Renders its children inside a container that fades/slides in the first
 * time it scrolls into view. Meaningful content groups only; it is not
 * meant for every paragraph.
 *
 * - Respects `prefers-reduced-motion` via the `.r-reveal` CSS (the element
 *   is simply visible).
 * - Never replays: once revealed it stays revealed.
 * - Falls back to instantly-visible when IntersectionObserver is missing.
 */
interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  /** Element type to render (defaults to a div). */
  as?: keyof React.JSX.IntrinsicElements;
  /** Extra delay before the reveal transition starts (ms). */
  delay?: number;
  /** IntersectionObserver threshold (default 0.12). */
  threshold?: number;
}

export const Reveal: React.FC<RevealProps> = ({
  as: Tag = 'div',
  delay = 0,
  threshold = 0.12,
  className = '',
  style,
  children,
  ...rest
}) => {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  const TagElement = Tag as React.ElementType;

  return (
    <TagElement
      ref={ref}
      className={`r-reveal ${visible ? 'is-visible' : ''} ${className}`.trim()}
      style={{ ...style, '--reveal-delay': `${delay}ms` } as React.CSSProperties}
      {...rest}
    >
      {children}
    </TagElement>
  );
};