# PuppyOne themes

_Portable CSS themes for PuppyOne Desktop · PuppyOne Desktop 可移植 CSS 主题_

---

This folder is the editable theme library used by PuppyOne Desktop. Each theme can be a self-contained folder whose `theme.css`, fonts, images, and license notices are copied, versioned, and shared together.

这个文件夹是 PuppyOne Desktop 使用的可编辑主题库。每个主题可以是一个独立文件夹，其中的 `theme.css`、字体、图片和许可证可以作为整体复制、版本管理和分享。

## 🚀 Quick start / 快速开始

1. Open **Settings → Appearance → Theme**.
2. Select **Open Themes Folder**. This is the safest way to locate the correct folder on every operating system and in development builds.
3. Copy a complete theme folder such as `paper-blue/` into the opened folder.
4. Return to PuppyOne. The theme catalog refreshes automatically when the app regains focus.
5. Choose the theme from **Theme Pack**. A pack always applies its Application, Markdown, and CSV styles together.

中文步骤：打开 **设置 → 外观 → 主题**，点击 **打开主题文件夹**，将完整主题文件夹复制进去，然后返回 PuppyOne。应用重新获得焦点时会自动刷新主题列表，最后从 **主题包** 中选择它。

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

## 📦 Built-in and installed themes / 内建与安装主题

Default, GitHub, and Newspaper are built into PuppyOne Desktop. They ship with the application and must not be copied into this folder. Every theme found in this folder is an installed extension owned by the user, regardless of its author.

Default、GitHub 和 Newspaper 内建在 PuppyOne Desktop 中，随应用发布，不应复制到这个文件夹。这个文件夹中的主题全部属于用户安装的扩展，与作者是否为 PuppyOne 无关。

Extension theme collections are maintained independently so their release cycle does not need to match the desktop application.

To install a theme obtained from a theme author or collection:

1. Download the complete theme directory without separating its assets.
2. Open the authoritative Themes Folder from Appearance.
3. Copy the theme directory into that folder.
4. Return to PuppyOne, review any diagnostics after the automatic refresh, and choose the theme.

从主题作者或主题集合获取完整主题文件夹后，将它复制到 Appearance 打开的主题目录。返回 PuppyOne 后主题会自动刷新，确认没有诊断错误后即可选择使用。

## ✍️ Theme folder format / 主题文件夹格式

The recommended shareable format keeps one coordinated CSS file and all optional assets inside one directory:

```text
paper-blue/
├── theme.css
├── fonts/
│   ├── MyFont-Regular.woff2
│   └── OFL.txt
└── images/                 # optional
    └── background.webp
```

`theme.css` contains metadata plus all three scoped targets:

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

A theme appears in **Theme Pack** only when it contains all three targets. PuppyOne deliberately does not expose separate packaged-theme selectors for Application, Markdown, or CSV: a pack is one coordinated visual product and always travels as a unit.

只有同时包含三个目标的主题才会出现在 **主题套装** 选择器中。PuppyOne 不再提供应用界面、Markdown 或 CSV 各自独立的主题选择器；一个主题套装始终作为完整、协调的视觉方案一起使用和传播。

The final style order is **Theme Pack → Editor Markdown preferences**. The Editor controls default to **Theme**, so authored CSS remains authoritative until a user explicitly overrides one property. To make broader visual changes, edit or install a complete theme file in the Themes Folder rather than applying a separate in-app CSS overlay.

最终样式顺序是 **主题套装 → 编辑器 Markdown 偏好**。编辑器控件默认选择 **跟随主题**；如果需要更广泛的个性化样式，请直接编辑或安装 Themes 文件夹中的完整主题文件，而不是使用单独的应用内 CSS 覆盖层。

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
- Ordinary themes must not use `!important`; PuppyOne manages Theme and Editor preference precedence deterministically.
- Relative local CSS imports, images, and fonts are supported when they remain inside the same theme directory.
- Network URLs, `file:` URLs, escaping paths, fixed positioning, and unsupported executable CSS values are rejected.
- Invalid themes are isolated and reported in Appearance without preventing other themes from loading.

主题 ID 必须稳定且唯一。主题 CSS 会经过解析、作用域隔离和安全检查；无效主题会显示诊断信息，但不会影响其他主题。

## 🔧 Compatibility formats / 兼容格式

A top-level `.css` file without `@puppyone-theme` can still be parsed as a Markdown-only Typora-style source for compatibility. PuppyOne recognizes `:root`, `html`, `body`, and `#write` as Markdown-surface aliases, but a Markdown-only file is not a complete Theme Pack and will not appear in the pack selector. Add PuppyOne metadata plus `application`, `markdown`, and `csv` blocks when converting it into a selectable pack.

不含 `@puppyone-theme` 的顶层 CSS 文件仍可按仅 Markdown 的 Typora 风格源码解析，以便兼容旧文件。PuppyOne 支持常见正文选择器，但这种文件不是完整主题套装，不会出现在套装选择器中；需要补充元数据以及 `application`、`markdown`、`csv` 三个目标块后才能作为套装选择。

Top-level coordinated `.css` files remain supported for backward compatibility. New themes should use `<theme-name>/theme.css`, with relative fonts and images inside that same directory. Use a `theme.json` package only when a theme deliberately splits targets across multiple CSS entrypoints.

顶层协调式 `.css` 仍然兼容，但新主题建议使用 `<主题名>/theme.css`，并将字体和图片放进同一目录。只有明确需要把多个目标拆成不同 CSS 入口时，才使用带 `theme.json` 的高级目录包。

## 🔄 Editing and troubleshooting / 编辑与排错

- After changing a file outside PuppyOne, return to the app; the catalog refreshes automatically when the window regains focus.
- If a theme does not appear, inspect the diagnostic shown in Appearance.
- If only one surface changes, confirm the file contains all intended `@puppyone` target blocks.
- If a new Theme Pack appears unchanged, confirm that it declares all three targets and then select it again after the automatic refresh.
- Keep a new theme ID unique; duplicate IDs are rejected deterministically.

在 PuppyOne 外修改文件后，返回应用即可自动刷新。如果主题没有出现，请查看 Appearance 中的诊断；如果只有某个界面发生变化，请检查三个目标块是否完整，然后重新选择该主题套装。

## 🔗 Sharing and contribution / 分享与贡献

To share a theme:

1. Share the complete theme directory and keep its styling in one `theme.css` whenever possible.
2. Use a unique ID, clear name, semantic version, and author metadata.
3. Test both Light and Dark modes.
4. Test Application, Markdown, and CSV when declaring all three targets.
5. Include the license and attribution required by any fonts, images, or source material you redistribute.
6. Do not bundle assets unless you have permission to redistribute them.

分享主题时，请分享完整主题文件夹，并优先将样式保持在一个 `theme.css` 中；同时填写唯一 ID、名称、版本和作者，测试亮色与暗色模式，并遵守字体、图片和参考素材的许可证要求。

Project repository: [puppyone-ai/puppyone-desktop](https://github.com/puppyone-ai/puppyone-desktop)

## 🔗 License and attribution / 许可证与致谢

This guide and the PuppyOne Desktop theme interface are distributed under the desktop repository's [Apache License 2.0](https://github.com/puppyone-ai/puppyone-desktop/blob/main/LICENSE). Theme CSS, fonts, images, and other assets obtained from an independent theme repository remain subject to the license and attribution supplied by their respective authors.

本指南及 PuppyOne Desktop 主题接口使用桌面应用仓库的 [Apache License 2.0](https://github.com/puppyone-ai/puppyone-desktop/blob/main/LICENSE)。从独立主题仓库获得的 CSS、字体、图片和其他资源，应遵守对应主题作者提供的许可证与署名要求。
