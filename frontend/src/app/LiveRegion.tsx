import { useEffect, useState } from "react";
import type { Announcement } from "./appState";

const ANNOUNCE_DELAY_MS = 30;

export function LiveRegion({ announcement }: { announcement: Announcement }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText("");
    const timer = setTimeout(() => setText(announcement.text), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [announcement]);
  return (
    <div className="sr-only" id="sr" role="status" aria-live="polite">
      {text}
    </div>
  );
}
