import type { PreparedAgent } from "./types";

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function listAnd(items: string[]): string {
  if (items.length < 2) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function siblingNumber(agent: PreparedAgent): number | null {
  const parent = agent.parent ? agent.by[agent.parent] : undefined;
  if (parent === undefined) {
    return null;
  }
  const sameName = parent.kids.filter((id) => agent.by[id]?.name === agent.name);
  return sameName.length > 1 ? sameName.indexOf(agent.id) + 1 : null;
}

export function plainName(agent: PreparedAgent): string {
  const number = siblingNumber(agent);
  return number === null ? agent.name : `${agent.name} ${number}`;
}
