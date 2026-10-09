import type { Agent, HelloEvent, RemoveEvent, Session, Turn } from "./types";

type UnknownRecord = Record<string, unknown>;
type Check = (value: unknown) => boolean;
type FieldChecks<Shape> = { [Key in keyof Shape]-?: Check };

const completenessValues: readonly unknown[] = ["complete", "partial", "activity_only"];
const finalValues: readonly unknown[] = ["complete", "failed"];
const stateValues: readonly unknown[] = ["running", "waiting", "blocked", "failed", "complete"];
const viaValues: readonly unknown[] = ["traces", "logs"];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isOneOf(allowed: readonly unknown[]): Check {
  return (value) => allowed.includes(value);
}

function isArrayOf(check: Check): Check {
  return (value) => Array.isArray(value) && value.every((item) => check(item));
}

function isOptional(check: Check): Check {
  return (value) => value === undefined || value === null || check(value);
}

function hasFields<Shape extends UnknownRecord>(
  value: unknown,
  fields: FieldChecks<Shape>,
): value is UnknownRecord {
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(fields).every(([name, check]) => check(value[name]));
}

type RunFields = FieldChecks<Session["run"]>;
const runFields: RunFields = {
  name: isString,
  repo: isString,
  source: isString,
  file: isString,
};

function isRun(value: unknown): boolean {
  return hasFields(value, runFields);
}

type ReturnedFields = FieldChecks<NonNullable<Agent["returned"]>>;
const returnedFields: ReturnedFields = {
  summary: isString,
  items: isArrayOf(isString),
  text: isOptional(isString),
  note: isOptional(isString),
};

function isReturned(value: unknown): boolean {
  return hasFields(value, returnedFields);
}

type PhaseFields = FieldChecks<NonNullable<Agent["phases"]>[number]>;
const phaseFields: PhaseFields = {
  at: isNumber,
  state: isOneOf(stateValues),
  note: isString,
};

function isPhase(value: unknown): boolean {
  return hasFields(value, phaseFields);
}

type ToolTurnType = Extract<Turn, { kind: "tool" }>;
type MsgTurnType = Extract<Turn, { kind: "msg" }>;
type UserTurnType = Extract<Turn, { kind: "user" }>;

type ToolTurnFields = FieldChecks<Omit<ToolTurnType, "kind">>;
const toolTurnFields: ToolTurnFields = {
  at: isNumber,
  name: isString,
  target: isString,
  out: isString,
  ms: isOptional(isNumber),
  fail: isOptional(isBoolean),
  pending: isOptional(isBoolean),
};

type MsgTurnFields = FieldChecks<Omit<MsgTurnType, "kind">>;
const msgTurnFields: MsgTurnFields = {
  at: isNumber,
  text: isString,
};

type UserTurnFields = FieldChecks<Omit<UserTurnType, "kind">>;
const userTurnFields: UserTurnFields = {
  at: isNumber,
  text: isString,
};

function isTurn(value: unknown): value is Turn {
  if (!isRecord(value)) {
    return false;
  }
  switch (value["kind"]) {
    case "tool":
      return hasFields(value, toolTurnFields);
    case "msg":
      return hasFields(value, msgTurnFields);
    case "user":
      return hasFields(value, userTurnFields);
    default:
      return false;
  }
}

type AgentFields = FieldChecks<Agent>;
const agentFields: AgentFields = {
  id: isNumber,
  name: isString,
  src: isString,
  start: isNumber,
  task: isString,
  context: isArrayOf(isString),
  turns: isArrayOf(isTurn),
  completeness: isOneOf(completenessValues),
  file: isOptional(isString),
  parent: isOptional(isNumber),
  brief: isOptional(isString),
  agentType: isOptional(isString),
  model: isOptional(isString),
  usage: isOptional(isUsage),
  end: isOptional(isNumber),
  final: isOptional(isOneOf(finalValues)),
  returned: isOptional(isReturned),
  phases: isOptional(isArrayOf(isPhase)),
  trimmed: isOptional(isNumber),
  approxTimes: isOptional(isBoolean),
};

type UsageFields = FieldChecks<NonNullable<Agent["usage"]>>;
const usageFields: UsageFields = {
  input: isNumber,
  output: isNumber,
  cacheRead: isNumber,
  cacheWrite: isNumber,
};

function isUsage(value: unknown): boolean {
  return hasFields(value, usageFields);
}

function isAgent(value: unknown): value is Agent {
  return hasFields(value, agentFields);
}

type SessionFields = FieldChecks<Session>;
const sessionFields: SessionFields = {
  id: isString,
  rawId: isOptional(isString),
  live: isBoolean,
  t0: isNumber,
  endAt: isNumber,
  via: isOptional(isOneOf(viaValues)),
  hooks: isOptional(isBoolean),
  run: isRun,
  agents: isArrayOf(isAgent),
};

function isSession(value: unknown): value is Session {
  return hasFields(value, sessionFields);
}

export function parseSession(value: unknown): Session | null {
  return isSession(value) ? value : null;
}

export function parseHello(value: unknown): HelloEvent | null {
  if (!isRecord(value) || !Array.isArray(value["sessions"])) {
    return null;
  }
  const sessions: Session[] = [];
  for (const candidate of value["sessions"]) {
    const session = parseSession(candidate);
    if (session === null) {
      return null;
    }
    sessions.push(session);
  }
  return { sessions };
}

export function parseRemove(value: unknown): RemoveEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = value["id"];
  return isString(id) ? { id } : null;
}
