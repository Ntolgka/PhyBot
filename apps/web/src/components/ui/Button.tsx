import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'accent-gradient text-white shadow-[0_8px_24px_-8px_rgba(139,92,246,0.6)] hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface-3 text-ink border border-border-strong hover:bg-surface-3/80',
  outline: 'bg-transparent text-ink border border-border-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-dim hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-lg',
  icon: 'h-10 w-10 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'secondary',
    size = 'md',
    pending = false,
    disabled,
    leadingIcon,
    trailingIcon,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled ?? pending}
      aria-busy={pending || undefined}
      className={cn(
        'focus-ring inline-flex items-center justify-center whitespace-nowrap font-medium transition-[filter,background-color,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : leadingIcon}
      {children}
      {!pending && trailingIcon}
    </button>
  );
});
