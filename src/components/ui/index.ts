export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Card, CardSection, type CardProps, type CardVariant, type CardPadding } from './Card';
export { Input, Textarea, type InputProps, type TextareaProps } from './Input';

/**
 * Typography utility classes (applied via className)
 * These are CSS-only and don't require component wrappers.
 */
export const Typography = {
  display: 'font-display',
  serif: 'font-serif',
  sans: 'font-sans',
  eyebrow: 'eyebrow',
  italicAccent: 'text-italic-accent',
  muted: 'text-muted',
  subtle: 'text-subtle',
  primary: 'text-primary-token',
} as const;

/**
 * Surface utility classes
 */
export const Surface = {
  paper: 'surface-paper',
  elevated: 'surface-elevated',
  muted: 'surface-muted',
} as const;

/**
 * Motion utility classes
 * Note: transitions are handled via CSS custom properties on elements.
 * These are for reference/documentation.
 */
export const Motion = {
  ease: 'var(--ease-reflectra)',
  durationQuick: 'var(--duration-quick)',
  durationBase: 'var(--duration-base)',
  durationSlow: 'var(--duration-slow)',
} as const;