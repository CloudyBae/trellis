import type { PreparedAgent } from "@/model";
import { clipText } from "./clipText";
import { roleOf } from "./roleOf";

const TASK_LABEL_LIMIT = 60;

export function basenameOfPaths(text: string): string {
  return text
    .split(" ")
    .map((word) => (word.startsWith("/") ? word.slice(word.lastIndexOf("/") + 1) || word : word))
    .join(" ");
}

export function taskLabel(agent: PreparedAgent): string | null {
  if (!agent.brief || roleOf(agent) !== "agent") {
    return null;
  }
  return clipText(basenameOfPaths(agent.brief), TASK_LABEL_LIMIT, 0.5);
}
