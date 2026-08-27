import { Terminal, type ITheme } from "@xterm/xterm";

export type TerminalRgbColor = [number, number, number];

export type TerminalDefaultColors = {
  foreground: TerminalRgbColor;
  background: TerminalRgbColor;
};

export function readTerminalTheme(element: HTMLElement): ITheme {
  return {
    background: cssColor(
      element,
      "--po-terminal-bg",
      cssColor(element, "--po-surface-terminal", "#fafafa"),
    ),
    foreground: cssColor(element, "--po-terminal-fg", cssColor(element, "--po-text", "#2f2a23")),
    cursor: cssColor(element, "--po-terminal-cursor", cssColor(element, "--po-text", "#2f2a23")),
    selectionBackground: cssColor(
      element,
      "--po-terminal-selection",
      cssColor(element, "--po-selected", "rgba(73, 55, 35, 0.17)"),
    ),
    scrollbarSliderBackground: "transparent",
    scrollbarSliderHoverBackground: "transparent",
    scrollbarSliderActiveBackground: "transparent",
    overviewRulerBorder: "transparent",
    black: cssColor(element, "--po-terminal-black", cssColor(element, "--po-text", "#2f2a23")),
    red: cssColor(element, "--po-terminal-red", cssColor(element, "--po-danger", "#dc2626")),
    green: cssColor(element, "--po-terminal-green", cssColor(element, "--po-success", "#15803d")),
    yellow: cssColor(element, "--po-terminal-yellow", cssColor(element, "--po-warning", "#b45309")),
    blue: cssColor(element, "--po-terminal-blue", cssColor(element, "--po-accent", "#2563eb")),
    magenta: cssColor(element, "--po-terminal-magenta", cssColor(element, "--po-purple", "#8057a8")),
    cyan: cssColor(element, "--po-terminal-cyan", cssColor(element, "--po-info", "#0284c7")),
    white: cssColor(element, "--po-terminal-white", cssColor(element, "--po-inset", "#e6ded1")),
    brightBlack: cssColor(
      element,
      "--po-terminal-bright-black",
      cssColor(element, "--po-text-muted", "#70685e"),
    ),
    brightRed: cssColor(element, "--po-terminal-bright-red", cssColor(element, "--po-danger", "#dc2626")),
    brightGreen: cssColor(element, "--po-terminal-bright-green", cssColor(element, "--po-success", "#15803d")),
    brightYellow: cssColor(element, "--po-terminal-bright-yellow", cssColor(element, "--po-warning", "#b45309")),
    brightBlue: cssColor(element, "--po-terminal-bright-blue", cssColor(element, "--po-accent", "#2563eb")),
    brightMagenta: cssColor(element, "--po-terminal-bright-magenta", cssColor(element, "--po-purple", "#8057a8")),
    brightCyan: cssColor(element, "--po-terminal-bright-cyan", cssColor(element, "--po-info", "#0284c7")),
    brightWhite: cssColor(element, "--po-terminal-bright-white", cssColor(element, "--po-text", "#2f2a23")),
  };
}

export function applyTerminalAppearance(terminal: Terminal, element: HTMLElement) {
  const theme = readTerminalTheme(element);
  terminal.options.theme = theme;
  terminal.options.fontFamily = readTerminalFontFamily(element);
  terminal.options.fontSize = readTerminalFontSize(element);
  terminal.refresh(0, Math.max(0, terminal.rows - 1));
  return terminalDefaultColorsFromTheme(theme);
}

export function terminalDefaultColorsFromTheme(theme: ITheme): TerminalDefaultColors {
  return {
    foreground: parseResolvedRgb(theme.foreground, [47, 42, 35]),
    background: parseResolvedRgb(theme.background, [251, 250, 247]),
  };
}

export function readTerminalFontFamily(element: HTMLElement) {
  return getComputedStyle(element).getPropertyValue("--po-font-terminal").trim()
    || '"Geist Mono", "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace';
}

export function readTerminalFontSize(element: HTMLElement) {
  const value = getComputedStyle(element).getPropertyValue("--po-terminal-font-size").trim();
  const fontSize = Number.parseFloat(value);
  return Number.isInteger(fontSize) ? fontSize : 13;
}

function cssColor(element: HTMLElement, name: string, fallback: string) {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return resolveCssColor(element, value || fallback);
}

function resolveCssColor(element: HTMLElement, color: string) {
  const probe = document.createElement("span");
  probe.style.color = color;
  if (!probe.style.color && !color.includes("var(") && !color.includes("color-mix(")) return color;

  probe.style.display = "none";
  element.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || color;
}

function parseResolvedRgb(value: string | undefined, fallback: TerminalRgbColor): TerminalRgbColor {
  if (typeof value !== "string") return fallback;
  const match = value.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*[\d.]+)?\s*\)$/iu,
  );
  if (!match) return fallback;
  const channels = match.slice(1, 4).map((channel) => Number(channel));
  if (channels.some((channel) => !Number.isFinite(channel))) return fallback;
  return channels.map((channel) => Math.min(Math.max(Math.round(channel), 0), 255)) as TerminalRgbColor;
}
