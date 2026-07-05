import React from 'react';

type Color = 'blue' | 'amber' | 'green' | 'gray' | 'red' | 'purple';

interface StatusBadgeProps {
  children: React.ReactNode;
  color?: Color;
  className?: string;
}

const COLOR: Record<Color, string> = {
  blue:   'badge-blue',
  amber:  'badge-amber',
  green:  'badge-green',
  gray:   'badge-gray',
  red:    'badge-red',
  purple: 'badge-purple',
};

/** Non-interactive status pill — visually distinct from action buttons. */
export default function StatusBadge({ children, color = 'gray', className = '' }: StatusBadgeProps) {
  return (
    <span className={`${COLOR[color]} ${className}`}>
      {children}
    </span>
  );
}
