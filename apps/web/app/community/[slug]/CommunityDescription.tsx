"use client";

import { useState } from "react";

export default function CommunityDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 220;

  return (
    <div className="mt-6 mb-2">
      <p
        className={`text-sm text-gray-600 leading-relaxed whitespace-pre-line ${!expanded && isLong ? "line-clamp-3" : ""}`}
      >
        {text}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700 mt-1"
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}
