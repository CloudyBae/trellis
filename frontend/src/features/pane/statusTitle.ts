import type { AgentStateName } from "@/model";

export const STATUS_TITLE: Record<AgentStateName, string> = {
  running: "Running",
  waiting: "Waiting",
  blocked: "Blocked",
  failed: "Failed",
  complete: "Complete",
};
