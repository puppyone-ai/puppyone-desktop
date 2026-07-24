import type { ReactNode } from "react";
import { Workflow } from "lucide-react";
import type { FileIconRenderContext } from "../iconThemeTypes";

export function AppGlyph({ color, size }: FileIconRenderContext): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M5.15 11.25h7.7c.7 0 1.25.5 1.37 1.18l.34 2.02H3.44l.34-2.02c.12-.68.67-1.18 1.37-1.18Z"
        fill="color-mix(in srgb, var(--po-file-icon-body) 72%, transparent)"
        stroke={color}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M9.65 11.25 8.75 6.8" stroke={color} strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="8.45" cy="4.9" r="2" fill="color-mix(in srgb, var(--po-file-icon-body) 72%, transparent)" stroke={color} strokeWidth="1.35" />
      <circle cx="12.2" cy="13.05" r="0.62" fill={color} opacity="0.76" />
      <circle cx="6.15" cy="13.05" r="0.46" fill={color} opacity="0.55" />
    </svg>
  );
}

export function WorkflowGlyph({ color, size }: FileIconRenderContext): ReactNode {
  return <Workflow size={size} color={color} strokeWidth={1.9} aria-hidden="true" />;
}

export function SpreadsheetGridGlyph({
  color,
  fill,
  size,
  strokeWidth = 1.2,
}: Readonly<{
  color: string;
  fill: string;
  size: number;
  strokeWidth?: number;
}>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      data-file-icon-shape="table-grid"
      data-file-icon-grid="2x2"
    >
      <rect
        x="3.5"
        y="3.5"
        width="11"
        height="11"
        rx="1.25"
        fill={fill}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M3.8 9h10.4M9 3.8v10.4"
        stroke={color}
        strokeWidth={strokeWidth * 0.78}
        opacity="0.82"
      />
    </svg>
  );
}

export function DocumentLinesSymbol({ color }: { color: string }) {
  return (
    <path
      d="M5.4 7.55h6.25M5.4 9.55h6.25M5.4 11.55h4.3"
      stroke={color}
      strokeWidth="1.05"
      strokeLinecap="round"
      opacity="0.9"
    />
  );
}
