import React from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT: Record<Variant, string> = {
  primary:     'btn-primary',
  secondary:   'btn-secondary',
  destructive: 'btn-destructive',
  ghost:       'btn-ghost',
};

const SIZE: Record<Size, string> = {
  sm: 'btn-sm',
  md: '',
};

/** Shared button component. For Link/anchor elements use the `.btn-primary` / `.btn-secondary` CSS classes directly. */
export default function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  const cls = [VARIANT[variant], SIZE[size], className].filter(Boolean).join(' ');
  return <button {...props} className={cls} />;
}
