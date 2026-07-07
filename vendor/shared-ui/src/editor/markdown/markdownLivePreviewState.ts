import { StateEffect } from "@codemirror/state";

export type ExpandedImageRange = {
  from: number;
  to: number;
};

export const markdownExpandedImageEffect = StateEffect.define<ExpandedImageRange | null>();
