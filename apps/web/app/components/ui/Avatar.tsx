import * as React from "react";

const sizes = {
  sm: "w-9 h-9 text-sm",
  md: "w-14 h-14 text-xl",
  lg: "w-16 h-16 text-2xl",
} as const;

export function Avatar({
  name, size = "md", className = "",
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <div
      className={
        `rounded-full bg-blue-50 flex items-center justify-center text-blue-500 font-bold flex-shrink-0 ` +
        `${sizes[size]} ${className}`
      }
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}
