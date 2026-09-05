import React from 'react';

/**
 * Reflectra design-system Button.
 * Foundation primitive — no business logic, no auth, no side effects.
 * Variants match the design tokens established in src/index.css.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'onPrimary';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  accent: 'btn-accent',
  onPrimary: 'btn-on-primary',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
};

const sizeStyle: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '0.4375rem 0.75rem', fontSize: '0.75rem' },
  md: { padding: '0.625rem 1rem', fontSize: '0.8125rem' },
  lg: { padding: '0.75rem 1.25rem', fontSize: '0.875rem' },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth = false, className = '', style, children, ...rest },
  ref
) {
  const mergedStyle: React.CSSProperties = {
    ...sizeStyle[size],
    ...(fullWidth ? { width: '100%' } : null),
    ...style,
  };
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      className={`btn ${variantClass[variant]} ${sizeClass[size]} ${className}`.trim()}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </button>
  );
});
