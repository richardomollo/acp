import * as React from "react";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Chip({ selected = false, className = "", ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={
        "px-3.5 py-2 rounded-[--radius-pill] text-sm font-bold whitespace-nowrap border-[1.5px] " +
        "transition-[transform,background,color] duration-150 active:scale-[0.97] " +
        (selected
          ? "bg-ink-900 text-white border-ink-900"
          : "bg-surface text-ink-600 border-border hover:bg-surface-muted") +
        ` ${className}`
      }
      {...props}
    />
  );
}
