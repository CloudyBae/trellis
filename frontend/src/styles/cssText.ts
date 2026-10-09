export type CssBlock = { prelude: string; body: string };

export function topLevelBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let prelude = "";
  let body = "";
  for (const character of css) {
    if (depth === 0) {
      if (character === "{") {
        depth = 1;
      } else if (character === ";") {
        prelude = "";
      } else {
        prelude += character;
      }
    } else if (character === "{") {
      depth += 1;
      body += character;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ prelude: prelude.trim(), body });
        prelude = "";
        body = "";
      } else {
        body += character;
      }
    } else {
      body += character;
    }
  }
  return blocks;
}

export function blockBody(css: string, header: string): string {
  const start = css.indexOf(header);
  if (start < 0) {
    throw new Error(`Missing block ${header}`);
  }
  const open = css.indexOf("{", start);
  return topLevelBlocks(css.slice(open)).at(0)?.body ?? "";
}

export function declarationsOf(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon > 0) {
      declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
    }
  }
  return declarations;
}
