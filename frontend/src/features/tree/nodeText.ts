import { activity } from "@/model";
import type { AgentState, PreparedAgent } from "@/model";
import { clipText } from "@/components/agent/clipText";
import { basenameOfPaths, taskLabel } from "@/components/agent/taskLabel";

const ROOT_LIMIT = 280;
const NARROW_LIMIT = 40;
const WIDE_LIMIT = 48;
const SENTENCE_END = ". ";

function firstSentence(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.endsWith(":"));
  const line = basenameOfPaths(lines[0] ?? "");
  const end = line.indexOf(SENTENCE_END);
  return end === -1 ? line : line.slice(0, end + 1);
}

export function nodeActivity(agent: PreparedAgent, state: AgentState, time: number, narrow: boolean, root: boolean): string {
  let text = "";
  if (root && state.s === "running") {
    text = activity(agent, time);
  } else if (state.s === "running") {
    text = taskLabel(agent) === null ? basenameOfPaths(agent.brief || agent.task) : activity(agent, time);
  } else if (state.s === "waiting" || state.s === "blocked") {
    text = state.note ?? "";
  } else {
    text = firstSentence(agent.returned?.summary ?? "");
  }
  return clipText(text, root ? ROOT_LIMIT : narrow ? NARROW_LIMIT : WIDE_LIMIT, 0.5);
}
