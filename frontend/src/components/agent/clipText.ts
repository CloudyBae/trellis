const TRAILING_PUNCTUATION = " \t\n\r,.;:";

function trimTrailingPunctuation(text: string): string {
  let end = text.length;
  while (end > 0 && TRAILING_PUNCTUATION.includes(text.charAt(end - 1))) {
    end -= 1;
  }
  return text.slice(0, end);
}

export function clipText(text: string, limit: number, minimumShare: number): string {
  if (text.length <= limit) {
    return text;
  }
  const space = text.lastIndexOf(" ", limit);
  return `${trimTrailingPunctuation(text.slice(0, space > limit * minimumShare ? space : limit))}…`;
}
