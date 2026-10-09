import type { Agent } from "@/api";
import { assertNever } from "@/model";

export type Completeness = Agent["completeness"];

export function completenessLabel(completeness: Completeness): string {
  switch (completeness) {
    case "complete":
      return "Conversation available";
    case "partial":
      return "Partial conversation";
    case "activity_only":
      return "Activity only, message content unavailable";
    default:
      return assertNever(completeness);
  }
}
