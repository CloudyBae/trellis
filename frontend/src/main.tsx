import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { EvalApp } from "./app/EvalApp";
import { createEvalDemo, createLiveEvalDemo } from "./demo/evals";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Missing root element");
}

const params = new URLSearchParams(window.location.search);
const screen = params.has("evals")
  ? createElement(EvalApp, { experiment: params.get("evals") === "live" ? createLiveEvalDemo() : createEvalDemo() })
  : createElement(App);

createRoot(rootElement).render(createElement(StrictMode, null, screen));
