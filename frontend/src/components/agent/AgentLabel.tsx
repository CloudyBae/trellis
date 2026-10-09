import { siblingNumber } from "@/model";
import type { PreparedAgent } from "@/model";
import "./agentLabel.css";

export function AgentLabel({ agent }: { agent: PreparedAgent }) {
  const number = siblingNumber(agent);
  return (
    <>
      {agent.name}
      {number === null ? null : (
        <>
          {" "}
          <span className="cn">{number}</span>
        </>
      )}
    </>
  );
}
