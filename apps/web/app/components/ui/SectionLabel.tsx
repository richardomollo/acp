import * as React from "react";

export function SectionLabel({
  eyebrow, title, action, className = "",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between mb-3 ${className}`}>
      <div>
        {eyebrow && (
          <p className="text-[11px] font-bold text-[--gray-200] uppercase tracking-wide mb-1">{eyebrow}</p>
        )}
        <p className="text-xl font-extrabold text-ink-900 leading-none">{title}</p>
      </div>
      {action}
    </div>
  );
}
