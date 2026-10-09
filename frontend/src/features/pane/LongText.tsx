import { clipText } from "@/components/agent/clipText";

const CLIP_MARGIN = 80;
const CLIP_SHARE = 0.6;

export function cut(text: string, limit: number): string {
  return clipText(text, limit, CLIP_SHARE);
}

export function LongText({ text, limit = 600 }: { text: string; limit?: number }) {
  if (text.length <= limit + CLIP_MARGIN) {
    return <>{text}</>;
  }
  return (
    <details className="more">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="clipped">{cut(text, limit)}</span>
        <span className="toggle"></span>
      </summary>
      <div className="full">{text}</div>
    </details>
  );
}
