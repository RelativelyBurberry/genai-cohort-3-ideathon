import React from 'react';

/**
 * Reflectra design-system Card.
 * Foundation primitive — layout surface only.
 * Variants match the design tokens in src/index.css.
 */

export type CardVariant = 'default' | 'elevated' | 'muted' | 'accent' | 'primary';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
}

const variantClass: Record<CardVariant, string> = {
  default: 'card',
  elevated: 'card card-elevated',
  muted: 'card card-muted',
  accent: 'card card-accent',
  primary: 'card card-primary',
};

const paddingStyle: Record<CardPadding, React.CSSProperties> = {
  none: { padding: 0 },
  sm: { padding: '1rem' },
  md: { padding: '1.5rem' },
  lg: { padding: '2rem' },
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  function Card({ variant = 'default', padding = 'md', interactive = false, className = '', style, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={`${variantClass[variant]} ${interactive ? 'card-interactive' : ''} ${className}`.trim()}
        style={{ ...paddingStyle[padding], ...style }}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

/**
 * Convenience wrapper for card sections with a built-in divider.
 */
export interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  divider?: boolean;
}

export const CardSection = React.forwardRef<HTMLDivElement, CardSectionProps>(
  function CardSection({ divider = false, className = '', style, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={`${divider ? 'border-t border-[var(--color-border)] pt-4 mt-4' : ''} ${className}`.trim()}
        style={style}
        {...rest}
      >
        {children}
      </div>
    );
  }
);