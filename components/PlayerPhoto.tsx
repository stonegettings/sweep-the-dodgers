"use client";

import { useState } from "react";

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export default function PlayerPhoto({ bbref, name, size = "md" }: { bbref: string; name: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`photo photo-${size}`} aria-hidden="true">
      <span className="photo-initials">{initials(name)}</span>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/photo/${bbref}`} alt="" loading="lazy" onError={() => setFailed(true)} />
      )}
    </div>
  );
}
