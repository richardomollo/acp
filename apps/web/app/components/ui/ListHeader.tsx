import * as React from "react";

export function ListHeader({
  title, action, className = "",
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <h2 className="text-xs font-bold text-[--text-secondary] uppercase tracking-wide">{title}</h2>
      {action}
    </div>
  );
}
