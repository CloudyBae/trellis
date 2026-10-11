import { Fragment } from "react";
import type { EvalMeasure } from "@/model";
import { formatInterval, formatMeasurePair, lowerFirst, measureChangeWords } from "@/lib/evals";
import "./evals.css";

type AvailableMeasure = Extract<EvalMeasure, { kind: "available" }>;

type MeasureRow = { id: string; name: string; measures: EvalMeasure[] };

const GROUPED_PREFIX = "efficiency-";

function rowsOf(measures: EvalMeasure[]): MeasureRow[] {
  const rows: MeasureRow[] = [];
  for (const measure of measures) {
    const grouped = measure.id.startsWith(GROUPED_PREFIX);
    const existing = grouped ? rows.find((row) => row.id === GROUPED_PREFIX.slice(0, -1)) : undefined;
    if (existing !== undefined) {
      existing.measures.push(measure);
    } else if (grouped) {
      rows.push({ id: GROUPED_PREFIX.slice(0, -1), name: measure.name.split(",")[0] ?? measure.name, measures: [measure] });
    } else {
      rows.push({ id: measure.id, name: measure.name, measures: [measure] });
    }
  }
  return rows;
}

function coveragePhrases(measure: AvailableMeasure): string[] {
  const { coverage } = measure;
  const base = `${coverage.included} of ${coverage.total} ${coverage.total === 1 ? "case" : "cases"}`;
  return coverage.note === undefined ? [base] : [base, coverage.note];
}

const SEPARATOR = "\u00a0\u00b7 ";

type Piece = { key: string; lead: string | null; tail: string };

function piecesOf(measures: EvalMeasure[]): Piece[] {
  const pieces: Piece[] = [];
  for (const measure of measures) {
    const piece: Piece =
      measure.kind === "available"
        ? {
            key: measure.id,
            lead: measureChangeWords(measure.change, measure.baseline.unit),
            tail: formatInterval(measure.change, measure.baseline.unit),
          }
        : { key: measure.reason, lead: null, tail: `Not available: ${lowerFirst(measure.reason)}` };
    if (!pieces.some((item) => item.key === piece.key)) {
      pieces.push(piece);
    }
  }
  return pieces;
}

type Phrase = { text: string; muted: boolean; wraps: boolean };

function phrasesOf(measures: EvalMeasure[]): Phrase[] {
  const phrases: Phrase[] = [];
  const add = (phrase: Phrase) => {
    if (!phrases.some((item) => item.text === phrase.text)) {
      phrases.push(phrase);
    }
  };
  for (const piece of piecesOf(measures)) {
    if (piece.lead === null) {
      add({ text: piece.tail, muted: true, wraps: true });
    } else {
      add({ text: piece.lead, muted: false, wraps: false });
      add({ text: piece.tail, muted: true, wraps: false });
    }
  }
  for (const measure of measures) {
    if (measure.kind === "available") {
      coveragePhrases(measure).forEach((text) => add({ text, muted: true, wraps: false }));
    }
  }
  return phrases;
}

function phraseClass(phrase: Phrase): string {
  return `${phrase.muted ? "eval-lichen " : ""}${phrase.wraps ? "eval-phrase-wrap" : "eval-phrase"}`.trim();
}

function ChangeLine({ measures }: { measures: EvalMeasure[] }) {
  return (
    <div className="eval-m-change">
      {phrasesOf(measures).map((phrase, index) => (
        <Fragment key={phrase.text}>
          {index === 0 ? null : <span className="eval-lichen">{SEPARATOR}</span>}
          <span className={phraseClass(phrase)}>{phrase.text}</span>
        </Fragment>
      ))}
    </div>
  );
}

function Row({ row }: { row: MeasureRow }) {
  const available = row.measures.flatMap((measure) => (measure.kind === "available" ? [measure] : []));
  return (
    <li className="eval-m-row" data-measure={row.id}>
      <div className="eval-m-name">{row.name}</div>
      {available.length === 0 ? null : (
        <div className="eval-m-value">
          {available.map((measure) => formatMeasurePair(measure.baseline, measure.candidate)).join(" · ")}
        </div>
      )}
      <ChangeLine measures={row.measures} />
    </li>
  );
}

export function MeasuresList({ measures }: { measures: EvalMeasure[] }) {
  return (
    <section className="eval-measures" aria-labelledby="eval-measures-title">
      <h2 id="eval-measures-title">Measures</h2>
      <ul>
        {rowsOf(measures).map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}
