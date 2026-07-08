import type mermaid from "mermaid";
import type { MermaidConfig } from "mermaid";

type MermaidModule = typeof mermaid;

export type MermaidThemeSnapshot = {
  key: string;
  config: MermaidConfig;
};

export type MermaidRenderResult = {
  svg: string;
  cacheKey: string;
  themeKey: string;
};

export type MermaidRenderRequest = {
  source: string;
  theme?: MermaidThemeSnapshot;
};

export type MermaidDebouncedRenderRequest = MermaidRenderRequest & {
  delayMs?: number;
  onResult: (result: MermaidRenderResult) => void;
  onError: (error: Error) => void;
};

export type MermaidThemeChangeUnsubscribe = () => void;

const MERMAID_CACHE_LIMIT = 48;

let mermaidModulePromise: Promise<MermaidModule> | null = null;
let mermaidRenderQueue: Promise<void> = Promise.resolve();
let initializedThemeKey = "";
let renderSequence = 0;
let themeObserver: MutationObserver | null = null;
let colorSchemeQuery: MediaQueryList | null = null;
let colorSchemeListener: (() => void) | null = null;
let themeNotificationFrame: number | null = null;

const svgCache = new Map<string, string>();
const themeChangeSubscribers = new Set<() => void>();

export function getMermaidThemeSnapshot(root: Element = document.documentElement): MermaidThemeSnapshot {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const background = read("--po-editor-bg", "#ffffff");
  const panel = read("--po-panel", "#f7f3ec");
  const text = read("--po-text", "#2f2a24");
  const textMuted = read("--po-text-muted", "#8a8073");
  const accent = read("--po-accent", "#2563eb");
  const divider = read("--po-divider", "#ded4c7");
  const success = read("--po-success", "#16a34a");
  const warning = read("--po-warning", "#d97706");
  const danger = read("--po-danger", "#dc2626");
  const fontFamily = read("--po-font-sans", "ui-sans-serif, system-ui, sans-serif");
  const isDark = isDarkColor(background);

  const config: MermaidConfig = {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    darkMode: isDark,
    htmlLabels: false,
    fontFamily,
    themeVariables: {
      background,
      mainBkg: panel,
      secondBkg: background,
      tertiaryColor: panel,
      primaryColor: panel,
      primaryTextColor: text,
      primaryBorderColor: divider,
      secondaryColor: background,
      secondaryTextColor: text,
      secondaryBorderColor: divider,
      tertiaryTextColor: text,
      tertiaryBorderColor: divider,
      lineColor: textMuted,
      textColor: text,
      noteTextColor: text,
      noteBkgColor: panel,
      noteBorderColor: divider,
      edgeLabelBackground: background,
      clusterBkg: panel,
      clusterBorder: divider,
      defaultLinkColor: textMuted,
      nodeBorder: divider,
      actorBkg: panel,
      actorBorder: divider,
      actorTextColor: text,
      signalColor: textMuted,
      signalTextColor: text,
      labelBoxBkgColor: panel,
      labelBoxBorderColor: divider,
      labelTextColor: text,
      loopTextColor: text,
      activationBkgColor: panel,
      activationBorderColor: divider,
      sequenceNumberColor: background,
      pie1: accent,
      pie2: success,
      pie3: warning,
      pie4: danger,
      git0: accent,
      git1: success,
      git2: warning,
      git3: danger,
      fontFamily,
    },
  };

  return {
    config,
    key: JSON.stringify(config),
  };
}

export async function renderMermaidDiagram({
  source,
  theme = getMermaidThemeSnapshot(),
}: MermaidRenderRequest): Promise<MermaidRenderResult> {
  const normalizedSource = normalizeMermaidSource(source);
  if (!normalizedSource) {
    throw new Error("Mermaid diagram is empty.");
  }

  const cacheKey = `${theme.key}\n${normalizedSource}`;
  const cachedSvg = svgCache.get(cacheKey);
  if (cachedSvg) {
    touchCacheEntry(cacheKey, cachedSvg);
    return {
      svg: cachedSvg,
      cacheKey,
      themeKey: theme.key,
    };
  }

  const sanitizedSvg = await enqueueMermaidRender(async () => {
    const mermaidInstance = await getMermaidModule();
    ensureMermaidInitialized(mermaidInstance, theme);

    const parseResult = await mermaidInstance.parse(normalizedSource, { suppressErrors: true });
    if (!parseResult) {
      throw new Error("Invalid Mermaid syntax.");
    }

    const { svg } = await mermaidInstance.render(createMermaidRenderId(), normalizedSource);
    return sanitizeMermaidSvg(svg);
  });
  setCacheEntry(cacheKey, sanitizedSvg);

  return {
    svg: sanitizedSvg,
    cacheKey,
    themeKey: theme.key,
  };
}

function enqueueMermaidRender<T>(render: () => Promise<T>): Promise<T> {
  const queuedRender = mermaidRenderQueue.then(render, render);
  mermaidRenderQueue = queuedRender.then(
    () => undefined,
    () => undefined,
  );
  return queuedRender;
}

export function createDebouncedMermaidRenderer() {
  let renderTimer: number | null = null;
  let requestId = 0;
  let disposed = false;

  return {
    render(request: MermaidDebouncedRenderRequest) {
      requestId += 1;
      const currentRequestId = requestId;
      if (renderTimer !== null) window.clearTimeout(renderTimer);

      renderTimer = window.setTimeout(() => {
        renderTimer = null;
        renderMermaidDiagram(request)
          .then((result) => {
            if (disposed || currentRequestId !== requestId) return;
            request.onResult(result);
          })
          .catch((error) => {
            if (disposed || currentRequestId !== requestId) return;
            request.onError(toError(error));
          });
      }, request.delayMs ?? 250);
    },
    cancel() {
      disposed = true;
      requestId += 1;
      if (renderTimer !== null) {
        window.clearTimeout(renderTimer);
        renderTimer = null;
      }
    },
  };
}

export function subscribeMermaidThemeChanges(callback: () => void): MermaidThemeChangeUnsubscribe {
  themeChangeSubscribers.add(callback);
  ensureMermaidThemeObserver();

  return () => {
    themeChangeSubscribers.delete(callback);
    if (themeChangeSubscribers.size === 0) disconnectMermaidThemeObserver();
  };
}

function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n?/g, "\n").trim();
}

async function getMermaidModule(): Promise<MermaidModule> {
  mermaidModulePromise ??= import("mermaid").then((module) => module.default);
  return mermaidModulePromise;
}

function ensureMermaidInitialized(mermaidInstance: MermaidModule, theme: MermaidThemeSnapshot) {
  if (initializedThemeKey === theme.key) return;
  mermaidInstance.initialize(theme.config);
  initializedThemeKey = theme.key;
}

function createMermaidRenderId(): string {
  renderSequence += 1;
  return `puppyone-mermaid-${Date.now()}-${renderSequence}`;
}

function sanitizeMermaidSvg(svg: string): string {
  const template = document.createElement("template");
  template.innerHTML = svg;

  template.content.querySelectorAll("script, iframe, object, embed, link, meta, base").forEach((node) => node.remove());
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (isUnsafeMermaidSvgAttribute(attribute)) element.removeAttribute(attribute.name);
    }
  }

  return template.innerHTML;
}

function isUnsafeMermaidSvgAttribute(attribute: Attr): boolean {
  const name = attribute.name.toLowerCase();
  const value = attribute.value.trim();

  if (name.startsWith("on")) return true;
  if (name === "src" || name === "srcset") return true;
  if (name === "href" || name === "xlink:href") return !isSafeMermaidSvgHref(attribute, value);
  return false;
}

function isSafeMermaidSvgHref(attribute: Attr, value: string): boolean {
  if (!value) return true;
  if (value.startsWith("#")) return true;

  const ownerTagName = attribute.ownerElement?.tagName.toLowerCase() ?? "";
  if (ownerTagName === "image" || ownerTagName === "use") return false;

  if (/^(?:https?:|mailto:)/i.test(value)) return true;
  return false;
}

function ensureMermaidThemeObserver() {
  if (themeObserver) return;

  themeObserver = new MutationObserver(scheduleMermaidThemeChangeNotification);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
  });
  if (document.body) {
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
    });
  }

  if ("matchMedia" in window) {
    colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    colorSchemeListener = scheduleMermaidThemeChangeNotification;
    colorSchemeQuery.addEventListener("change", colorSchemeListener);
  }
}

function disconnectMermaidThemeObserver() {
  themeObserver?.disconnect();
  themeObserver = null;
  if (colorSchemeQuery && colorSchemeListener) {
    colorSchemeQuery.removeEventListener("change", colorSchemeListener);
  }
  colorSchemeQuery = null;
  colorSchemeListener = null;
  if (themeNotificationFrame !== null) {
    window.cancelAnimationFrame(themeNotificationFrame);
    themeNotificationFrame = null;
  }
}

function scheduleMermaidThemeChangeNotification() {
  if (themeNotificationFrame !== null) return;

  themeNotificationFrame = window.requestAnimationFrame(() => {
    themeNotificationFrame = null;
    for (const callback of Array.from(themeChangeSubscribers)) callback();
  });
}

function setCacheEntry(cacheKey: string, svg: string) {
  svgCache.set(cacheKey, svg);
  while (svgCache.size > MERMAID_CACHE_LIMIT) {
    const oldestKey = svgCache.keys().next().value;
    if (!oldestKey) break;
    svgCache.delete(oldestKey);
  }
}

function touchCacheEntry(cacheKey: string, svg: string) {
  svgCache.delete(cacheKey);
  svgCache.set(cacheKey, svg);
}

function isDarkColor(value: string): boolean {
  const rgb = parseCssColor(value);
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance < 0.45;
}

function parseCssColor(value: string): { r: number; g: number; b: number } | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const raw = hex[1];
    const normalized = raw.length === 3
      ? raw.split("").map((character) => `${character}${character}`).join("")
      : raw;
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value.trim());
  if (!rgb) return null;

  return {
    r: Number.parseFloat(rgb[1]),
    g: Number.parseFloat(rgb[2]),
    b: Number.parseFloat(rgb[3]),
  };
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}
