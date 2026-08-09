import * as React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  radius?: "lg" | "xl" | "2xl";
}

const radii = {
  lg: "rounded-[16px]",
  xl: "rounded-[20px]",
  "2xl": "rounded-[24px]",
} as const;

export function Card({ elevated, radius = "lg", className = "", ...props }: CardProps) {
  return (
    <div
      className={
        `bg-surface border border-[--border-faint] overflow-hidden ` +
        `${radii[radius]} ${elevated ? "shadow-md" : ""} ${className}`
      }
      {...props}
    />
  );
}
