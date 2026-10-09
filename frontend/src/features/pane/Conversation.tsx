import { assertNever, turnsOf } from "@/model";
import type { PreparedAgent, TimelineTurn } from "@/model";
import { AgentLabel } from "@/components/agent/AgentLabel";
import { LongText, cut } from "./LongText";

const OPENING_LIMIT = 400;
const OPENING_CUT = 320;

type ToolTurn = Extract<TimelineTurn, { kind: "tool" }>;

type ConversationProps = {
  agent: PreparedAgent;
  parent: PreparedAgent | undefined;
  now: number;
  onGo: (id: number) => void;
};

function Chevron() {
  return (
    <svg className="chev" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M3 1.5 L7 5 L3 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function toolTiming(turn: ToolTurn): { text: string; className: string } {
  if (turn.pending) {
    return { text: "waiting", className: "tms live" };
  }
  const time =
    turn.ms == null ? "" : turn.ms < 1000 ? `${turn.ms}ms` : `${(turn.ms / 1000).toFixed(1)}s`;
  const text = turn.fail ? (time ? `failed · ${time}` : "failed") : time;
  return { text, className: turn.fail ? "tms bad" : "tms" };
}

function turnKeys(turns: TimelineTurn[]): string[] {
  const counts = new Map<string, number>();
  return turns.map((turn) => {
    const identity =
      turn.kind === "delegate" ? `delegate:${turn.to}` : turn.kind === "result" ? `result:${turn.from}` : `${turn.kind}:${turn.at}`;
    const ordinal = counts.get(identity) ?? 0;
    counts.set(identity, ordinal + 1);
    return `${identity}:${ordinal}`;
  });
}

function TurnRow({ turn, agent, onGo }: { turn: TimelineTurn; agent: PreparedAgent; onGo: (id: number) => void }) {
  switch (turn.kind) {
    case "msg":
      return (
        <li className="turn msg-agent">
          <div className="by">{agent.name}</div>
          <div className="body">
            <LongText text={turn.text} limit={700} />
          </div>
        </li>
      );
    case "user":
      return (
        <li className="turn msg-user">
          <div className="by">you</div>
          <div className="body">
            <LongText text={turn.text} limit={700} />
          </div>
        </li>
      );
    case "delegate": {
      const kid = agent.by[turn.to];
      return (
        <li className="turn">
          <div className="by">delegated</div>
          <div className="body">
            {kid ? (
              <>
                <button className="link" data-go={kid.id} onClick={() => onGo(kid.id)}>
                  <AgentLabel agent={kid} />
                </button>
                : {kid.task}
              </>
            ) : null}
          </div>
        </li>
      );
    }
    case "result": {
      const kid = agent.by[turn.from];
      return (
        <li className="turn">
          <div className="by">{kid?.final === "failed" ? "failed" : "returned"}</div>
          <div className="body">
            {kid ? (
              <>
                <button className="link" data-go={kid.id} onClick={() => onGo(kid.id)}>
                  <AgentLabel agent={kid} />
                </button>
                : {kid.returned?.summary}
              </>
            ) : null}
          </div>
        </li>
      );
    }
    case "tool": {
      const timing = toolTiming(turn);
      return (
        <li className="turn tool">
          <div className="by">tool</div>
          <div className="body">
            <details>
              <summary>
                <Chevron />
                <span className="tname">{turn.name}</span>
                <span className="ttarget">{turn.target}</span>
                <span className={timing.className}>{timing.text}</span>
              </summary>
              <pre>{turn.out}</pre>
            </details>
          </div>
        </li>
      );
    }
    default:
      return assertNever(turn);
  }
}

export function Conversation({ agent, parent, now, onGo }: ConversationProps) {
  const turns = turnsOf(agent, now);
  const keys = turnKeys(turns);
  const opening = agent.task.length > OPENING_LIMIT ? cut(agent.task, OPENING_CUT) : agent.task;
  return (
    <>
      <h2>Conversation</h2>
      <ol className="convo">
        {turns
          .map((turn, index) => <TurnRow key={keys[index]} turn={turn} agent={agent} onGo={onGo} />)
          .reverse()}
        {agent.trimmed ? <li className="turns-trimmed">{agent.trimmed} earlier turns are not shown.</li> : null}
        {parent ? (
          <li className="turn task">
            <div className="by">{parent.name}</div>
            <div className="body">{opening}</div>
          </li>
        ) : (
          <li className="turn msg-user">
            <div className="by">you</div>
            <div className="body">{opening}</div>
          </li>
        )}
      </ol>
    </>
  );
}
