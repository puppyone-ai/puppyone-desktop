const OFFICE_FONT_STYLE_ID = "puppyone-office-font-compatibility";

const CJK_TEXT_PATTERN = /[\u2e80-\u2eff\u3000-\u303f\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/u;
const CJK_COMPATIBLE_FONT_PATTERN = /pingfang|heiti|songti|kaiti|fangsong|yahei|dengxian|simhei|simsun|nsimsun|黑体|宋体|新宋体|楷体|仿宋|等线|微软雅黑|noto\s+(?:sans|serif)\s+cjk|source\s+han|arial\s+unicode/i;
const OFFICE_CJK_FALLBACK_STACK = [
  '"PingFang SC"',
  '"Heiti SC"',
  '"Microsoft YaHei"',
  '"Noto Sans CJK SC"',
  '"Arial Unicode MS"',
  "sans-serif",
].join(", ");

/**
 * Local aliases for common Windows Office fonts. They only participate when a
 * document asks for the matching family, so source typography remains in
 * control whenever the authored font is available.
 */
export const OFFICE_FONT_COMPATIBILITY_CSS = `
  @font-face {
    font-family: "宋体";
    src: local("Songti SC"), local("STSong"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "SimSun";
    src: local("Songti SC"), local("STSong"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "新宋体";
    src: local("Songti SC"), local("STSong"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "NSimSun";
    src: local("Songti SC"), local("STSong"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "黑体";
    src: local("Heiti SC"), local("STHeiti"), local("PingFang SC"), local("Noto Sans CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "SimHei";
    src: local("Heiti SC"), local("STHeiti"), local("PingFang SC"), local("Noto Sans CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "等线";
    src: local("PingFang SC"), local("Microsoft YaHei"), local("Noto Sans CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "DengXian";
    src: local("PingFang SC"), local("Microsoft YaHei"), local("Noto Sans CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "微软雅黑";
    src: local("PingFang SC"), local("Microsoft YaHei"), local("Noto Sans CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "Microsoft YaHei";
    src: local("PingFang SC"), local("Microsoft YaHei"), local("Noto Sans CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "仿宋";
    src: local("STFangsong"), local("FangSong"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "FangSong";
    src: local("STFangsong"), local("FangSong"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "楷体";
    src: local("Kaiti SC"), local("STKaiti"), local("KaiTi"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "KaiTi";
    src: local("Kaiti SC"), local("STKaiti"), local("KaiTi"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "Calibri";
    src: local("Aptos"), local("Calibri"), local("Arial");
    font-display: swap;
  }

  @font-face {
    font-family: "Cambria";
    src: local("Cambria"), local("Georgia"), local("Times New Roman");
    font-display: swap;
  }
`;

export function ensureOfficeFontCompatibilityStyles(targetDocument: Document): void {
  if (targetDocument.getElementById(OFFICE_FONT_STYLE_ID)) return;

  const style = targetDocument.createElement("style");
  style.id = OFFICE_FONT_STYLE_ID;
  style.dataset.officeFontCompatibility = "true";
  style.textContent = OFFICE_FONT_COMPATIBILITY_CSS;
  targetDocument.head.append(style);
}

/**
 * The PPTX renderer preserves declared font stacks. Some Office files keep the
 * East Asian family only in theme metadata, though, and a run can reach the DOM
 * as Times New Roman alone. Append a local CJK fallback to those runs without
 * replacing the authored family, size, weight, or spacing.
 */
export function applyOfficeCjkFontFallbacks(root: ParentNode): number {
  const selector = "[style], [font-family]";
  const candidates: Array<HTMLElement | SVGElement> = [
    ...(root instanceof Element && root.matches(selector) ? [root as HTMLElement | SVGElement] : []),
    ...root.querySelectorAll<HTMLElement | SVGElement>(selector),
  ];
  let updatedCount = 0;

  for (const element of candidates) {
    if (!CJK_TEXT_PATTERN.test(element.textContent ?? "")) continue;

    const inlineFamily = element.style.fontFamily.trim();
    const attributeFamily = element.getAttribute("font-family")?.trim() ?? "";
    const declaredFamily = inlineFamily || attributeFamily;
    if (!declaredFamily || CJK_COMPATIBLE_FONT_PATTERN.test(declaredFamily)) continue;

    const compatibleFamily = `${declaredFamily}, ${OFFICE_CJK_FALLBACK_STACK}`;
    if (inlineFamily) {
      const priority = element.style.getPropertyPriority("font-family");
      element.style.setProperty("font-family", compatibleFamily, priority);
    } else {
      element.setAttribute("font-family", compatibleFamily);
    }
    updatedCount += 1;
  }

  return updatedCount;
}
