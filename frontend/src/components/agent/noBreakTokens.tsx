import type { ReactNode } from "react";

function isSpace(character: string): boolean {
  return character.trim() === "";
}

function splitTokens(text: string): string[] {
  const tokens: string[] = [];
  let previousWasSpace: boolean | null = null;
  for (const character of text) {
    const space = isSpace(character);
    if (tokens.length > 0 && previousWasSpace === space) {
      tokens[tokens.length - 1] += character;
    } else {
      tokens.push(character);
    }
    previousWasSpace = space;
  }
  return tokens;
}

function isNoBreakToken(token: string): boolean {
  return !isSpace(token.charAt(0)) && (token.includes("-") || token.includes("/"));
}

export function noBreakTokens(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let plain = "";
  splitTokens(text).forEach((token, index) => {
    if (isNoBreakToken(token)) {
      if (plain) {
        nodes.push(plain);
        plain = "";
      }
      nodes.push(
        <span className="nb" key={index}>
          {token}
        </span>,
      );
    } else {
      plain += token;
    }
  });
  if (plain) {
    nodes.push(plain);
  }
  return nodes;
}
