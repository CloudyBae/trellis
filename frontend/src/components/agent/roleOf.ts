import type { PreparedAgent } from "@/model";

export type Role =
  | "orchestrator"
  | "researcher"
  | "explorer"
  | "planner"
  | "implementer"
  | "reviewer"
  | "docs"
  | "testwriter"
  | "typecheck"
  | "fixer"
  | "testrunner"
  | "agent";

const ROLE_BY_NAME = new Map<string, Role>([
  ["Orchestrator", "orchestrator"],
  ["Researcher", "researcher"],
  ["Explorer", "explorer"],
  ["Planner", "planner"],
  ["Implementer", "implementer"],
  ["Security reviewer", "reviewer"],
  ["Reviewer", "reviewer"],
  ["Docs writer", "docs"],
  ["Test writer", "testwriter"],
  ["Type checker", "typecheck"],
  ["Fixer", "fixer"],
  ["Test runner", "testrunner"],
]);

function isWordCharacter(character: string | undefined): boolean {
  if (character === undefined) {
    return false;
  }
  return (
    (character >= "a" && character <= "z") ||
    (character >= "0" && character <= "9") ||
    character === "_"
  );
}

function containsAny(text: string, fragments: string[]): boolean {
  return fragments.some((fragment) => text.includes(fragment));
}

function startsWordAt(text: string, fragment: string, requireWholeWord: boolean): boolean {
  let index = text.indexOf(fragment);
  while (index >= 0) {
    const startsWord = !isWordCharacter(text[index - 1]);
    const endsWord = !requireWholeWord || !isWordCharacter(text[index + fragment.length]);
    if (startsWord && endsWord) {
      return true;
    }
    index = text.indexOf(fragment, index + 1);
  }
  return false;
}

function mentionsInOrder(text: string, first: string, second: string): boolean {
  const firstIndex = text.indexOf(first);
  return firstIndex >= 0 && text.indexOf(second, firstIndex + first.length) >= 0;
}

function mentionsTypeCheck(text: string): boolean {
  let index = text.indexOf("type");
  while (index >= 0) {
    const afterType = index + "type".length;
    const separated = text[afterType] !== "\n" && text.startsWith("check", afterType + 1);
    if (text.startsWith("check", afterType) || separated) {
      return true;
    }
    index = text.indexOf("type", index + 1);
  }
  return false;
}

export function guessRole(description: string): Role {
  const text = description.toLowerCase();
  if (containsAny(text, ["review", "audit", "critic", "security"])) {
    return "reviewer";
  }
  if (mentionsInOrder(text, "test", "writ") || mentionsInOrder(text, "writ", "test")) {
    return "testwriter";
  }
  if (containsAny(text, ["test", "runner"]) || startsWordAt(text, "qa", true)) {
    return "testrunner";
  }
  if (startsWordAt(text, "doc", false) || containsAny(text, ["writer", "document"])) {
    return "docs";
  }
  if (containsAny(text, ["plan", "architect"])) {
    return "planner";
  }
  if (containsAny(text, ["explor", "search", "scout", "find"])) {
    return "explorer";
  }
  if (text.includes("research")) {
    return "researcher";
  }
  if (containsAny(text, ["fix", "debug"])) {
    return "fixer";
  }
  if (mentionsTypeCheck(text) || text.includes("lint")) {
    return "typecheck";
  }
  if (containsAny(text, ["implement", "build", "code", "engineer", "develop"])) {
    return "implementer";
  }
  return "agent";
}

export function roleOf(agent: Pick<PreparedAgent, "parent" | "name" | "agentType">): Role {
  if (!agent.parent) {
    return "orchestrator";
  }
  return ROLE_BY_NAME.get(agent.name) ?? guessRole(`${agent.name} ${agent.agentType ?? ""}`);
}
