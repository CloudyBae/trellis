import type { components } from "./generated/schema";

export type Session = components["schemas"]["Session"];
export type Agent = components["schemas"]["Agent"];
export type Turn = Agent["turns"][number];
export type HelloEvent = components["schemas"]["HelloEvent"];
export type RemoveEvent = components["schemas"]["RemoveEvent"];
