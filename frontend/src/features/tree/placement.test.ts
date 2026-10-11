import { describe, expect, it } from "vitest";
import type { Session } from "@/api";
import { agentOf, preparedOf } from "../../model/agentFixtures";
import type { NodePlacement } from "./placement";
import { placeTree } from "./placement";
import { payloadSession, withAgents } from "@/test/payloadSessions";

const WIDE = 5000;
const LABEL_RESERVE = 150;
const ROOT_LABEL_RESERVE = 108;
const POD = 58;
const WIRE_AND_DROP = 80;
const ROW_HEIGHT = POD + LABEL_RESERVE + WIRE_AND_DROP;
const RESERVES = { labelReserve: LABEL_RESERVE, rootLabelReserve: ROOT_LABEL_RESERVE };

function ascending(left: number, right: number): number {
  return left - right;
}

function byId(nodes: NodePlacement[]): Map<number, NodePlacement> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function place(flowWidth: number) {
  const session = payloadSession("codex/parent_variants.json");
  const placement = placeTree({
    ...RESERVES,
    agents: session.agents,
    time: session.endAt,
    narrow: false,
    selectedId: null,
    flowWidth,
    foldEarlier: false,
  });
  return { session, placement, nodes: byId(placement.nodes) };
}

function nodeOf(nodes: Map<number, NodePlacement>, id: number): NodePlacement {
  const node = nodes.get(id);
  if (node === undefined) {
    throw new Error(`No node ${id}`);
  }
  return node;
}

describe("placeTree on the parent_variants payload", () => {
  it("places nodes in agent order and nests a grandchild one row below its parent", () => {
    const { session, nodes, placement } = place(WIDE);
    expect(placement.nodes.map((node) => node.id)).toEqual(session.agents.map((agent) => agent.id));
    expect(nodeOf(nodes, 1).root).toBe(true);
    expect(nodeOf(nodes, 17).top - nodeOf(nodes, 2).top).toBe(ROW_HEIGHT);
    expect(nodeOf(nodes, 17).left).toBe(nodeOf(nodes, 2).left);
    expect(nodeOf(nodes, 3).top).toBe(nodeOf(nodes, 2).top);
    expect(nodeOf(nodes, 3).left - nodeOf(nodes, 2).left).toBe(152);
  });

  it("wraps a wide level onto new wires and grows the sizer to hold every tier", () => {
    const wide = place(WIDE);
    const narrow = place(1000);
    const firstTierLefts = [2, 8, 14].map((id) => nodeOf(narrow.nodes, id).left);
    expect(new Set(firstTierLefts).size).toBe(1);
    const wires = new Set(narrow.placement.edges.filter((edge) => edge.parentId === 1).map((edge) => edge.wireY));
    expect(wires.size).toBe(3);
    expect(new Set(wide.placement.edges.filter((edge) => edge.parentId === 1).map((edge) => edge.wireY)).size).toBe(1);
    expect(nodeOf(narrow.nodes, 8).top).toBeGreaterThan(nodeOf(narrow.nodes, 2).top);
    expect(nodeOf(narrow.nodes, 14).top).toBeGreaterThan(nodeOf(narrow.nodes, 8).top);
    expect(narrow.placement.height).toBeGreaterThan(wide.placement.height);
    expect(wide.placement.width).toBeGreaterThan(narrow.placement.width);
  });

  it("floors the available width so a hidden flow never collapses the layout", () => {
    const hidden = place(0);
    expect(hidden.placement.availableWidth).toBe(300);
    expect(hidden.placement.width).toBeGreaterThanOrEqual(300);
    expect(hidden.placement.nodes).toHaveLength(17);
  });

  it("routes a straight drop for an only child and a curved wire for a root child", () => {
    const { nodes, placement } = place(WIDE);
    const edges = new Map(placement.edges.map((edge) => [edge.id, edge]));
    const grandchildEdge = edges.get(17);
    const parent = nodeOf(nodes, 2);
    const grandchild = nodeOf(nodes, 17);
    const columnCenter = parent.left + 76;
    expect(grandchildEdge?.path).toBe(`M${columnCenter} ${parent.top + POD + LABEL_RESERVE + 4} L${columnCenter} ${grandchild.top - 8}`);

    const firstChild = nodeOf(nodes, 2);
    const firstEdge = edges.get(2);
    expect(firstEdge?.path.startsWith("M45 80 L45 ")).toBe(true);
    expect(firstEdge?.path).toContain(" Q45 ");
    expect(firstEdge?.path.endsWith(`L${firstChild.left + 76} ${firstChild.top - 8}`)).toBe(true);
    const rootWireEnds = placement.edges.filter((edge) => edge.parentId === 1).map((edge) => edge.path);
    expect(new Set(rootWireEnds).size).toBe(rootWireEnds.length);
  });

  it("caps the leaves at four, reports the total and keeps a failed call visible", () => {
    const { session } = place(WIDE);
    const tool = { at: 1, kind: "tool" as const, name: "Read", target: "", out: "" };
    const turns = [{ ...tool, fail: true }, ...Array.from({ length: 6 }, () => tool)];
    const agents = session.agents.map((agent) => (agent.id === 2 ? { ...agent, turns } : agent));
    const placement = placeTree({ ...RESERVES, agents, time: session.endAt, narrow: false, selectedId: null, flowWidth: WIDE, foldEarlier: false });
    const edge = placement.edges.find((candidate) => candidate.id === 2);
    expect(edge?.leaves.map((leaf) => leaf.state)).toEqual(["failed", "ok", "ok", "ok"]);
    expect(edge?.toolTotal).toBe(7);
  });

  it("draws the ancestry of the selected agent last", () => {
    const { session } = place(WIDE);
    const placement = placeTree({
      ...RESERVES,
      agents: session.agents,
      time: session.endAt,
      narrow: false,
      selectedId: 17,
      flowWidth: WIDE,
      foldEarlier: false,
    });
    const order = placement.edges.map((edge) => edge.id);
    expect(placement.edges.filter((edge) => edge.lit).map((edge) => edge.id).sort(ascending)).toEqual([2, 17]);
    expect(order.slice(-2).sort(ascending)).toEqual([2, 17]);
  });

  it("uses narrower columns on a narrow screen", () => {
    const session = payloadSession("codex/parent_variants.json");
    const placement = placeTree({ ...RESERVES, agents: session.agents, time: session.endAt, narrow: true, selectedId: null, flowWidth: WIDE, foldEarlier: false });
    const nodes = byId(placement.nodes);
    expect(nodeOf(nodes, 3).left - nodeOf(nodes, 2).left).toBe(132);
  });

  it("omits agents that have not started yet", () => {
    const session = payloadSession("codex/parent_variants.json");
    const placement = placeTree({ ...RESERVES, agents: session.agents, time: 5, narrow: false, selectedId: null, flowWidth: WIDE, foldEarlier: false });
    expect(placement.nodes.map((node) => node.id)).not.toContain(17);
    expect(placement.edges.map((edge) => edge.id)).not.toContain(17);
  });
});

describe("folding agents from earlier prompts", () => {
  const PROMPT_AT = 50;

  function foldedSession() {
    const root = agentOf(1, { turns: [{ at: 0, kind: "user", text: "first" }, { at: PROMPT_AT, kind: "user", text: "second" }] });
    const finished = agentOf(2, { parent: 1, start: 5, end: 20, final: "complete" });
    const finishedChild = agentOf(3, { parent: 2, start: 6, end: 10, final: "complete" });
    const running = agentOf(4, { parent: 1, start: 8 });
    const current = agentOf(5, { parent: 1, start: 55, end: 60, final: "complete" });
    return preparedOf([root, finished, finishedChild, running, current]);
  }

  function place(foldEarlier: boolean, selectedId: number | null = null) {
    return placeTree({ ...RESERVES, agents: foldedSession(), time: 70, narrow: false, selectedId, flowWidth: WIDE, foldEarlier });
  }

  it("replaces finished agents from before the latest prompt with one counted node", () => {
    const placement = place(true);
    expect(placement.fold?.count).toBe(2);
    expect(placement.nodes.map((node) => node.id)).toEqual([1, 4, 5]);
    expect(placement.edges.map((edge) => edge.id)).toContain(0);
  });

  it("keeps the agents when unfolded and when the selection is inside the fold", () => {
    expect(place(false).fold).toBeNull();
    expect(place(false).nodes).toHaveLength(5);
    const selected = place(true, 3);
    expect(selected.nodes.map((node) => node.id)).toContain(3);
    expect(selected.fold).toBeNull();
  });
});

describe("the tree invariant", () => {
  const LATER = 62;

  function nodesAt(edit: (session: Session) => Session, flowWidth: number): Map<number, NodePlacement> {
    const session = payloadSession("codex/parent_variants.json", 0, edit);
    return byId(placeTree({ ...RESERVES, agents: session.agents, time: LATER, narrow: false, selectedId: null, flowWidth, foldEarlier: false }).nodes);
  }

  it("keeps every existing node where it was when a leaf joins a parent that is not the deepest in its tier", () => {
    const leaf = agentOf(18, { name: "Late leaf", parent: 3, start: LATER, task: "late" });
    const before = nodesAt((session) => session, 1000);
    const after = nodesAt((session) => withAgents(session, [leaf]), 1000);
    expect(after.size).toBe(before.size + 1);
    before.forEach((node, id) => {
      expect(nodeOf(after, id).top).toBe(node.top);
      expect(nodeOf(after, id).left).toBe(node.left);
    });
    expect(nodeOf(after, 18).top - nodeOf(after, 3).top).toBe(ROW_HEIGHT);
  });

  it("moves later tiers down when the leaf deepens a tier that has a later tier", () => {
    const leaf = agentOf(18, { name: "Deep leaf", parent: 17, start: LATER, task: "deep" });
    const before = nodesAt((session) => session, 1000);
    const after = nodesAt((session) => withAgents(session, [leaf]), 1000);
    expect(nodeOf(after, 2).top).toBe(nodeOf(before, 2).top);
    expect(nodeOf(after, 8).top - nodeOf(before, 8).top).toBe(ROW_HEIGHT);
    expect(nodeOf(after, 14).top - nodeOf(before, 14).top).toBe(ROW_HEIGHT);
  });

  it("moves the wrapped subtree and later tiers down when the row wraps", () => {
    const grandchild = agentOf(18, { name: "Wrapped leaf", parent: 8, start: LATER, task: "wrapped" });
    const edit = (session: Session) => withAgents(session, [grandchild]);
    const single = nodesAt(edit, WIDE);
    const wrapped = nodesAt(edit, 1000);
    expect(nodeOf(wrapped, 2).top).toBe(nodeOf(single, 2).top);
    expect(nodeOf(wrapped, 8).top).toBeGreaterThan(nodeOf(single, 8).top);
    expect(nodeOf(wrapped, 18).top).toBeGreaterThan(nodeOf(single, 18).top);
    expect(nodeOf(wrapped, 18).top - nodeOf(wrapped, 8).top).toBe(ROW_HEIGHT);
    expect(nodeOf(wrapped, 14).top).toBeGreaterThan(nodeOf(single, 14).top);
  });
});

describe("the measured label reserve", () => {
  const TALL_RESERVE = 190;
  const TALL_ROOT_RESERVE = 140;

  function placeReserved(labelReserve: number, rootLabelReserve: number, agents = payloadSession("codex/parent_variants.json").agents) {
    const placement = placeTree({
      agents,
      time: payloadSession("codex/parent_variants.json").endAt,
      narrow: false,
      selectedId: null,
      flowWidth: WIDE,
      foldEarlier: false,
      labelReserve,
      rootLabelReserve,
    });
    return { placement, nodes: byId(placement.nodes) };
  }

  it("spaces rows and starts child edges by the passed reserve", () => {
    const base = placeReserved(LABEL_RESERVE, ROOT_LABEL_RESERVE);
    const tall = placeReserved(TALL_RESERVE, ROOT_LABEL_RESERVE);
    const extra = TALL_RESERVE - LABEL_RESERVE;
    expect(nodeOf(tall.nodes, 17).top - nodeOf(tall.nodes, 2).top).toBe(POD + TALL_RESERVE + WIRE_AND_DROP);
    expect(tall.placement.height - base.placement.height).toBe(extra * 2);
    const parent = nodeOf(tall.nodes, 2);
    const edge = tall.placement.edges.find((candidate) => candidate.id === 17);
    expect(edge?.path.startsWith(`M${parent.left + 76} ${parent.top + POD + TALL_RESERVE + 4} `)).toBe(true);
  });

  it("pushes the first wire below a taller root label", () => {
    const base = placeReserved(LABEL_RESERVE, ROOT_LABEL_RESERVE);
    const tall = placeReserved(LABEL_RESERVE, TALL_ROOT_RESERVE);
    expect(nodeOf(tall.nodes, 2).top - nodeOf(base.nodes, 2).top).toBe(TALL_ROOT_RESERVE - ROOT_LABEL_RESERVE);
  });

  it("keeps every position when an unrelated agent's activity changes", () => {
    const session = payloadSession("codex/parent_variants.json");
    const tool = { at: 1, kind: "tool" as const, name: "Read", target: "a very long path that would make the label wrap", out: "" };
    const changed = session.agents.map((agent) =>
      agent.id === 3 ? { ...agent, brief: "x ".repeat(200), turns: [tool, tool, tool] } : agent,
    );
    const before = placeReserved(TALL_RESERVE, TALL_ROOT_RESERVE, session.agents);
    const after = placeReserved(TALL_RESERVE, TALL_ROOT_RESERVE, changed);
    expect(after.placement.nodes).toEqual(before.placement.nodes);
    expect(after.placement.height).toBe(before.placement.height);
  });

  it("follows the passed content width for the available width", () => {
    const wide = place(900);
    const narrower = place(600);
    expect(wide.placement.availableWidth).toBe(892);
    expect(narrower.placement.availableWidth).toBe(592);
  });
});

describe("the trailing edge padding", () => {
  const FIRST_COLUMN_X = 63;
  const COLUMN = 152;
  const EDGE_PADDING = 16;
  const ALLOWANCE = 8;

  function placeLeaves(count: number, availableWidth: number) {
    const kids = Array.from({ length: count }, (_, index) => agentOf(index + 2, { parent: 1, start: 1, name: `Leaf ${index}` }));
    const agents = preparedOf([agentOf(1, {}), ...kids]);
    return placeTree({
      ...RESERVES,
      agents,
      time: 10,
      narrow: false,
      selectedId: null,
      flowWidth: availableWidth + ALLOWANCE,
      foldEarlier: false,
    });
  }

  it("keeps a tier that ends inside the edge padding on one row without widening past the available width", () => {
    const availableWidth = FIRST_COLUMN_X + COLUMN * 3 + EDGE_PADDING - 1;
    const placement = placeLeaves(3, availableWidth);
    expect(placement.availableWidth).toBe(availableWidth);
    expect(new Set(placement.nodes.filter((node) => !node.root).map((node) => node.top)).size).toBe(1);
    expect(placement.width).toBe(availableWidth);
  });

  it("wraps a tier whose last column would pass the available width", () => {
    const placement = placeLeaves(3, FIRST_COLUMN_X + COLUMN * 3 - 1);
    expect(new Set(placement.nodes.filter((node) => !node.root).map((node) => node.top)).size).toBe(2);
    expect(placement.width).toBeLessThanOrEqual(placement.availableWidth);
  });
});
