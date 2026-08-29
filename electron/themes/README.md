# PuppyOne themes

_Portable CSS themes for PuppyOne Desktop · PuppyOne Desktop 可移植 CSS 主题_

---

This folder is the editable theme library used by PuppyOne Desktop. A theme can coordinate the application interface, Markdown editor, and CSV table view while remaining a normal CSS file that can be copied, versioned, and shared.

这个文件夹是 PuppyOne Desktop 使用的可编辑主题库。每个主题都可以同时控制应用界面、Markdown 编辑器和 CSV 表格视图，并且仍然是一个可以复制、版本管理和分享的普通 CSS 文件。

## 🚀 Quick start / 快速开始

1. Open **Settings → Appearance → Theme**.
2. Select **Open Themes Folder**. This is the safest way to locate the correct folder on every operating system and in development builds.
3. Copy a theme such as `paper-blue.css` into the opened folder.
4. Return to Appearance and select **Reload Themes**.
5. Choose the theme from **Theme Pack**. Selecting a pack applies it to Application, Markdown, and CSV when all three targets are present.

中文步骤：打开 **设置 → 外观 → 主题**，点击 **打开主题文件夹**，将 `.css` 文件复制进去，然后点击 **重新加载主题**，最后从 **主题包** 中选择它。

> 📌 **Important / 重要：** Do not put user themes inside the application installation directory or source-code checkout. Application upgrades may replace those locations. 不要把用户主题放进应用安装目录或源码目录，这些位置可能在升级时被替换。

## 📍 Where this folder belongs / Themes 文件夹位置

The authoritative location is always the folder opened by **Open Themes Folder**. Internally, PuppyOne uses:

```text
${app.getPath("userData")}/themes/
```

Typical production locations are:

| Platform | Typical path |
| -------- | ------------ |
| macOS | `~/Library/Application Support/puppyone/themes/` |
| Windows | `%APPDATA%\puppyone\themes\` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/puppyone/themes/` |

Development and preview builds may use a channel-specific directory such as `puppyone-development/themes`. Therefore, prefer the in-app button instead of manually guessing the path.

开发版和预览版可能使用类似 `puppyone-development/themes` 的独立目录，所以建议始终通过应用内的 **打开主题文件夹** 按钮定位。

## 📦 Getting themes / 获取主题

PuppyOne Desktop provides the theme engine and this authoring guide, but it does not bundle downloadable theme CSS in the application repository. Theme collections can be maintained and shared independently without coupling their release cycle to the desktop application.

PuppyOne Desktop 提供主题引擎和这份编写指南，但应用仓库不再附带可分发的主题 CSS。主题集合可以在独立仓库中维护和分享，不必与桌面应用使用相同的发布周期。

To install a theme obtained from a theme author or collection:

1. Download the `.css` file without changing its extension.
2. Open the authoritative Themes Folder from Appearance.
3. Copy the file into that folder.
4. Select **Reload Themes**, review any diagnostics, and choose the theme.

从主题作者或主题集合获取 `.css` 文件后，将它复制到 Appearance 打开的主题目录，点击 **重新加载主题**，确认没有诊断错误后即可选择使用。

## ✍️ Single-file theme format / 单文件主题格式

The recommended shareable format is one CSS file containing metadata plus one or more scoped targets:

```css
@puppyone-theme {
  id: com.example.paper-blue;
  name: Paper Blue;
  version: 1.0.0;
  author: Your Name;
  modes: light dark;
}

@puppyone application {
  .theme-root {
    --po-surface-canvas: #eef4fb;
    --po-surface-panel: #ffffff;
    --po-text: #243247;
    --po-text-muted: #66758a;
    --po-divider: #d4deea;
    --po-accent: #4776b5;
  }

  .theme-root.dark,
  .dark .theme-root {
    --po-surface-canvas: #18202c;
    --po-surface-panel: #222c3a;
    --po-text: #e7edf5;
  }
}

@puppyone markdown {
  .theme-root {
    --po-md-surface-background: #ffffff;
    --po-md-content-color: #2f3743;
    --po-md-content-line-height: 1.75;
  }

  .theme-root .cm-md-heading-1,
  .theme-root h1 {
    text-align: center;
    border-bottom: 2px solid #4776b5;
  }

  .theme-root .cm-md-heading-2,
  .theme-root h2 {
    padding: 4px 12px;
    border-radius: 6px;
    background: #4776b5;
    color: #ffffff;
  }
}

@puppyone csv {
  .theme-root {
    --po-csv-surface-background: #ffffff;
    --po-csv-surface-color: #2f3743;
    --po-editable-table-cell-border: #d4deea;
    --po-editable-table-sticky-header-background: #eef4fb;
    --po-editable-table-cell-focus-ring: #4776b5;
  }
}
```

The three targets are:

| Target | Controls |
| ------ | -------- |
| `application` | Application shell color tokens only |
| `markdown` | Markdown typography, headings, quotes, code, lists, and rendered tables |
| `csv` | CSV/table surface and editable-table tokens |

A theme containing all three targets appears in the primary **Theme Pack** selector. A partial theme remains available under **Advanced theme overrides** for its supported surface.

包含三个目标的主题会出现在主要的 **主题包** 选择器中；只包含部分目标的主题会出现在 **高级主题覆盖** 的对应选项中。

The final style order is **Theme Pack or Advanced surface theme → Editor Markdown overrides → enabled Custom CSS**. The Editor controls default to **Theme**, so authored CSS remains authoritative until a user explicitly overrides one property. Custom CSS is an independent final overlay and can be disabled without deleting its source.

最终样式顺序是 **主题包或高级单界面主题 → 编辑器 Markdown 覆盖 → 已启用的自定义 CSS**。编辑器控件默认选择 **跟随主题**；自定义 CSS 是独立的最后一层，可以停用而不删除源码。

## 🎨 Markdown styling / Markdown 样式

Markdown themes may combine public `--po-md-*` variables with scoped selectors. Style both forms when an effect should appear consistently in Live Preview and rendered HTML:

```css
@puppyone markdown {
  /* CodeMirror-native Markdown heading */
  .theme-root .cm-md-heading-1,
  /* Rendered HTML heading */
  .theme-root h1 {
    text-align: center;
  }

  .theme-root .cm-md-blockquote,
  .theme-root blockquote {
    border-inline-start: 4px solid #4776b5;
    background: #eef4fb;
  }
}
```

Useful public variables include:

- `--po-md-surface-background`
- `--po-md-content-color`
- `--po-md-content-font`
- `--po-md-content-size`
- `--po-md-content-line-height`
- `--po-md-block-gap`
- `--po-md-h1-size` through `--po-md-h6-size`
- `--po-md-h1-weight` through `--po-md-h3-weight`
- `--po-md-rule-color`
- `--po-markdown-editor-text-width`

For heading size, bold color, and bold weight, prefer these public variables over hard-coded declarations when you want the Editor controls to remain interoperable with your theme. Direct selectors are still available for distinctive treatments such as centered H1 headings, underlines, colored H2 blocks, quotes, and code blocks.

## ⚙️ Compatibility and safety / 兼容与安全

- Theme IDs must use a stable lowercase reverse-domain form such as `com.example.paper-blue`.
- `application` accepts public PuppyOne color tokens only; themes cannot restructure the application UI.
- `markdown` and `csv` selectors are automatically scoped to their own surfaces.
- Ordinary themes must not use `!important`; PuppyOne manages Theme, Editor, and Custom CSS precedence deterministically.
- Relative local CSS imports, images, and fonts are supported when they remain inside the Themes Folder.
- Network URLs, `file:` URLs, escaping paths, fixed positioning, and unsupported executable CSS values are rejected.
- Invalid themes are isolated and reported in Appearance without preventing other themes from loading.

主题 ID 必须稳定且唯一。主题 CSS 会经过解析、作用域隔离和安全检查；无效主题会显示诊断信息，但不会影响其他主题。

## 🔧 Typora-style and advanced packages / Typora 与高级目录包

A top-level `.css` file without `@puppyone-theme` is treated as a Markdown-only Typora-style theme. PuppyOne recognizes `:root`, `html`, `body`, and `#write` as Markdown-surface aliases, but it does not support every Typora application-chrome selector.

不含 `@puppyone-theme` 的顶层 CSS 文件会作为仅 Markdown 的 Typora 风格主题加载。PuppyOne 支持常见正文选择器，但不会直接兼容所有 Typora 应用界面选择器。

Use a directory package with `theme.json` only when a theme needs multiple CSS files or local assets. For themes without assets, prefer the single-file format because it is easier to download and share.

只有在需要多个 CSS 文件、字体或图片资源时才建议使用带 `theme.json` 的目录包；普通主题优先使用单 CSS 文件，更方便传播。

## 🔄 Editing and troubleshooting / 编辑与排错

- After changing a file, click **Reload Themes** before checking the result.
- If a theme does not appear, inspect the diagnostic shown in Appearance.
- If only one surface changes, confirm the file contains all intended `@puppyone` target blocks.
- If a new Theme Pack appears unchanged, set Advanced overrides to **Follow Theme Pack** or select the pack again to clear them.
- Keep a new theme ID unique; duplicate IDs are rejected deterministically.

修改文件后必须点击 **重新加载主题**。如果主题没有出现，请查看 Appearance 中的诊断；如果只有某个界面发生变化，请检查目标块是否完整，并确认高级覆盖设置为 **跟随主题包**。

## 🔗 Sharing and contribution / 分享与贡献

To share a theme:

1. Keep it as one `.css` file whenever possible.
2. Use a unique ID, clear name, semantic version, and author metadata.
3. Test both Light and Dark modes.
4. Test Application, Markdown, and CSV when declaring all three targets.
5. Include the license and attribution required by any fonts, images, or source material you redistribute.
6. Do not bundle assets unless you have permission to redistribute them.

分享主题时，请优先保持单文件结构，填写唯一 ID、名称、版本和作者，测试亮色与暗色模式，并遵守字体、图片和参考素材的许可证要求。

Project repository: [puppyone-ai/puppyone-desktop](https://github.com/puppyone-ai/puppyone-desktop)

## 🔗 License and attribution / 许可证与致谢

This guide and the PuppyOne Desktop theme interface are distributed under the desktop repository's [Apache License 2.0](https://github.com/puppyone-ai/puppyone-desktop/blob/main/LICENSE). Theme CSS, fonts, images, and other assets obtained from an independent theme repository remain subject to the license and attribution supplied by their respective authors.

本指南及 PuppyOne Desktop 主题接口使用桌面应用仓库的 [Apache License 2.0](https://github.com/puppyone-ai/puppyone-desktop/blob/main/LICENSE)。从独立主题仓库获得的 CSS、字体、图片和其他资源，应遵守对应主题作者提供的许可证与署名要求。
