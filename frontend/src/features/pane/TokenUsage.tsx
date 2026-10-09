import type { PreparedAgent } from "@/model";
import { tokens } from "@/lib/format";

const ROWS = [
  { label: "Input", pick: (usage: NonNullable<PreparedAgent["usage"]>) => usage.input },
  { label: "Output", pick: (usage: NonNullable<PreparedAgent["usage"]>) => usage.output },
  { label: "Cache read", pick: (usage: NonNullable<PreparedAgent["usage"]>) => usage.cacheRead },
  { label: "Cache written", pick: (usage: NonNullable<PreparedAgent["usage"]>) => usage.cacheWrite },
];

function cachedShare(usage: NonNullable<PreparedAgent["usage"]>): string | null {
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  if (promptTokens === 0) {
    return null;
  }
  const share = (usage.cacheRead / promptTokens) * 100;
  return share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`;
}

export function TokenUsage({ agent }: { agent: PreparedAgent }) {
  const usage = agent.usage;
  if (usage === undefined || usage === null) {
    return null;
  }
  const share = cachedShare(usage);
  return (
    <>
      <h2>Tokens</h2>
      <dl className="tokens">
        {ROWS.map((row) => {
          const count = row.pick(usage);
          return (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd title={count.toLocaleString("en-US")}>{tokens(count)}</dd>
            </div>
          );
        })}
        {share === null ? null : (
          <div className="cached-share">
            <dt>Cache hit rate</dt>
            <dd>{share}</dd>
          </div>
        )}
      </dl>
    </>
  );
}
