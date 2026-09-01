/** @vitest-environment happy-dom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentStreamFlushScheduler } from "../src/features/desktop-agent/application/AgentEventSynchronizer";
import { SafeMarkdown } from "../src/features/desktop-agent/ui/SafeMarkdown";
import { splitStreamingMarkdown } from "../src/features/desktop-agent/domain/agent-stream-presentation";
import { useAgentStreamPresentation } from "../src/features/desktop-agent/ui/useAgentStreamPresentation";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Agent stream presentation", () => {
  it("smooths append-only deltas on the injected frame cadence and flushes completion immediately", () => {
    const frames: Array<() => void> = [];
    const schedule: AgentStreamFlushScheduler = (callback) => {
      frames.push(callback);
      return () => {
        const index = frames.indexOf(callback);
        if (index >= 0) frames.splice(index, 1);
      };
    };
    const container = mount(<StreamHarness text="A" streaming schedule={schedule} />);
    rerender(<StreamHarness text="ABCDEFGHIJK" streaming schedule={schedule} />);
    expect(container.textContent).toBe("A");
    expect(frames).toHaveLength(1);
    rerender(<StreamHarness text="ABCDEFGHIJKLMNOP" streaming schedule={schedule} />);
    expect(frames).toHaveLength(1);

    act(() => frames.shift()?.());
    expect(container.textContent?.startsWith("A")).toBe(true);
    expect(container.textContent).not.toBe("A");
    expect(container.textContent).not.toBe("ABCDEFGHIJKLMNOP");

    rerender(<StreamHarness text="ABCDEFGHIJK complete" streaming={false} schedule={schedule} />);
    expect(container.textContent).toBe("ABCDEFGHIJK complete");
    expect(frames).toHaveLength(0);
  });

  it("keeps the live Markdown tail structurally stable until completion", () => {
    const container = mount(withTestLocalization(<SafeMarkdown text={"Paragraph\n\n**typing"} streaming />));
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector(".desktop-agent-markdown-stream-tail")?.textContent).toContain("**typing");
    expect(container.querySelector(".desktop-agent-stream-caret")).not.toBeNull();

    rerender(withTestLocalization(<SafeMarkdown text={"Paragraph\n\n**done**"} streaming={false} />));
    expect(container.querySelector("strong")?.textContent).toBe("done");
    expect(container.querySelector(".desktop-agent-markdown-stream-tail")).toBeNull();
    expect(container.querySelector(".desktop-agent-stream-caret")).toBeNull();
  });

  it("keeps backtick and tilde fences inert until their matching close fence arrives", () => {
    expect(splitStreamingMarkdown("Before\n\n~~~mermaid\ngraph TD; A-->B")).toEqual({
      stable: "Before\n\n",
      tail: "~~~mermaid\ngraph TD; A-->B",
    });
    expect(splitStreamingMarkdown("Before\n\n~~~~mermaid\ngraph TD; A-->B\n~~~\n")).toEqual({
      stable: "Before\n\n",
      tail: "~~~~mermaid\ngraph TD; A-->B\n~~~\n",
    });
    expect(splitStreamingMarkdown("Before\n\n~~~~mermaid\ngraph TD; A-->B\n~~~~\n")).toEqual({
      stable: "Before\n\n~~~~mermaid\ngraph TD; A-->B\n~~~~\n",
      tail: "",
    });
  });
});

function StreamHarness({
  text,
  streaming,
  schedule,
}: {
  text: string;
  streaming: boolean;
  schedule: AgentStreamFlushScheduler;
}) {
  return <span>{useAgentStreamPresentation(text, streaming, schedule)}</span>;
}

function mount(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

function rerender(node: React.ReactElement) {
  act(() => root?.render(node));
}
