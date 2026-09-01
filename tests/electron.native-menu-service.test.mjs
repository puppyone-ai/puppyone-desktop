import { describe, expect, it, vi } from "vitest";
import { createDesktopNativeMenuService } from "../electron/main/native-menu-service.mjs";

function createHarness({ platform = "darwin" } = {}) {
  const Menu = {
    buildFromTemplate: vi.fn((template) => ({ template })),
    setApplicationMenu: vi.fn(),
  };
  const app = { name: "puppyone", dock: { setMenu: vi.fn() } };
  const actions = {
    checkForUpdates: vi.fn(),
    markdownCommand: vi.fn(),
    newWindow: vi.fn(),
    openThemesDirectory: vi.fn(),
    selectTheme: vi.fn(),
  };
  const labels = {
    "native.menu.file": "File",
    "native.menu.checkForUpdates": "Check for Updates…",
    "native.menu.paragraph": "Paragraph",
    "native.menu.paragraph.text": "Paragraph",
    "native.menu.paragraph.heading1": "Heading 1",
    "native.menu.paragraph.heading2": "Heading 2",
    "native.menu.paragraph.heading3": "Heading 3",
    "native.menu.paragraph.heading4": "Heading 4",
    "native.menu.paragraph.heading5": "Heading 5",
    "native.menu.paragraph.heading6": "Heading 6",
    "native.menu.paragraph.bulletList": "Bulleted List",
    "native.menu.paragraph.orderedList": "Numbered List",
    "native.menu.paragraph.taskList": "Task List",
    "native.menu.paragraph.quote": "Block Quote",
    "native.menu.paragraph.codeBlock": "Code Block",
    "native.menu.paragraph.mathBlock": "Math Block",
    "native.menu.paragraph.indent": "Indent",
    "native.menu.paragraph.outdent": "Outdent",
    "native.menu.format": "Format",
    "native.menu.format.strong": "Bold",
    "native.menu.format.emphasis": "Italic",
    "native.menu.format.underline": "Underline",
    "native.menu.format.strike": "Strikethrough",
    "native.menu.format.inlineCode": "Inline Code",
    "native.menu.format.inlineMath": "Inline Math",
    "native.menu.format.link": "Link",
    "native.menu.format.clear": "Clear Formatting",
    "native.menu.theme": "Theme",
    "native.menu.theme.pack": "Visual Variant",
    "native.menu.theme.openFolder": "Open Themes Folder",
    "native.dock.newWindow": "New Window",
  };
  const service = createDesktopNativeMenuService({
    app,
    Menu,
    platform,
    t: (messageId) => labels[messageId] ?? messageId,
    onCheckForUpdates: actions.checkForUpdates,
    onNewWindow: actions.newWindow,
    onMarkdownCommand: actions.markdownCommand,
    isMarkdownEditorActive: () => true,
    onOpenThemesDirectory: actions.openThemesDirectory,
    onSelectTheme: actions.selectTheme,
  });
  return { actions, app, Menu, service };
}

describe("DesktopNativeMenuService", () => {
  it("installs a native macOS File menu and shares New Window with the Dock", async () => {
    const { actions, app, Menu, service } = createHarness();

    expect(service.refresh()).toEqual({ supported: true });
    expect(Menu.setApplicationMenu).toHaveBeenCalledOnce();
    expect(app.dock.setMenu).toHaveBeenCalledOnce();

    const applicationTemplate = Menu.buildFromTemplate.mock.calls[0][0];
    expect(applicationTemplate.map((item) => item.role ?? item.label)).toEqual([
      "puppyone",
      "File",
      "editMenu",
      "Paragraph",
      "Format",
      "viewMenu",
      "Theme",
      "windowMenu",
      "help",
    ]);

    const appItems = applicationTemplate[0].submenu;
    const checkForUpdates = appItems.find((item) => item.id === "app.checkForUpdates");
    expect(appItems.map((item) => item.role ?? item.id ?? item.type)).toEqual([
      "about",
      "separator",
      "app.checkForUpdates",
      "separator",
      "services",
      "separator",
      "hide",
      "hideOthers",
      "unhide",
      "separator",
      "quit",
    ]);
    expect(checkForUpdates).toMatchObject({ label: "Check for Updates…" });

    const fileItems = applicationTemplate[1].submenu;
    const newWindow = fileItems.find((item) => item.id === "file.newWindow");
    expect(fileItems).toHaveLength(3);
    expect(newWindow).toMatchObject({ label: "New Window", accelerator: "CmdOrCtrl+N" });
    expect(fileItems[1]).toEqual({ type: "separator" });
    expect(fileItems.at(-1)).toEqual({ role: "close" });

    newWindow.click();
    checkForUpdates.click();
    Menu.buildFromTemplate.mock.calls[1][0][0].click();
    await Promise.resolve();
    await Promise.resolve();

    expect(actions.newWindow).toHaveBeenCalledTimes(2);
    expect(actions.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("builds focused Markdown paragraph and format menus with semantic commands", async () => {
    const { actions, service } = createHarness();
    const template = service.createApplicationMenuTemplate();
    const paragraph = template.find((item) => item.id === "paragraph");
    const format = template.find((item) => item.id === "format");

    expect(paragraph.submenu.filter((item) => item.id).map((item) => item.id)).toEqual([
      "markdown.paragraph",
      "markdown.heading-1",
      "markdown.heading-2",
      "markdown.heading-3",
      "markdown.heading-4",
      "markdown.heading-5",
      "markdown.heading-6",
      "markdown.bullet-list",
      "markdown.ordered-list",
      "markdown.task-list",
      "markdown.quote",
      "markdown.code-block",
      "markdown.math-block",
      "markdown.outdent",
      "markdown.indent",
    ]);
    expect(format.submenu.filter((item) => item.id).map((item) => item.id)).toEqual([
      "markdown.strong",
      "markdown.emphasis",
      "markdown.underline",
      "markdown.strike",
      "markdown.inline-code",
      "markdown.inline-math",
      "markdown.link",
      "markdown.clear-format",
    ]);
    expect(paragraph.submenu.every((item) => item.type === "separator" || item.enabled)).toBe(true);
    expect(format.submenu.every((item) => item.type === "separator" || item.enabled)).toBe(true);
    expect(paragraph.submenu.find((item) => item.id === "markdown.paragraph")).not.toHaveProperty("accelerator");

    paragraph.submenu.find((item) => item.id === "markdown.math-block").click();
    format.submenu.find((item) => item.id === "markdown.inline-math").click();
    await Promise.resolve();
    await Promise.resolve();
    expect(actions.markdownCommand.mock.calls).toEqual([["math-block"], ["inline-math"]]);
  });

  it("disables Markdown menus when no editable Markdown editor is focused", () => {
    const { service } = createHarness();
    const inactiveService = createDesktopNativeMenuService({
      app: { name: "puppyone" },
      Menu: { buildFromTemplate: (template) => ({ template }), setApplicationMenu() {} },
      t: (messageId) => messageId,
      onCheckForUpdates() {},
      onMarkdownCommand() {},
      onNewWindow() {},
      isMarkdownEditorActive: () => false,
    });
    expect(service.createApplicationMenuTemplate().find((item) => item.id === "paragraph").enabled).toBe(true);
    expect(inactiveService.createApplicationMenuTemplate().find((item) => item.id === "paragraph").enabled).toBe(false);
    expect(inactiveService.createApplicationMenuTemplate().find((item) => item.id === "format").enabled).toBe(false);
  });

  it("builds one coordinated theme-pack group without Customize", async () => {
    const { actions, service } = createHarness();
    service.setThemeState({
      pack: "builtin.pack.forest",
      requiredTargets: ["application", "markdown", "csv"],
      themes: [
        { id: "default.neutral", name: "Neutral", targets: ["application", "markdown", "csv"] },
        { id: "default.warm", name: "Warm", targets: ["application", "markdown", "csv"] },
        { id: "builtin.pack.forest", name: "Forest", targets: ["application", "markdown", "csv"] },
        { id: "local.puppyone.custom-css", name: "My Custom CSS", targets: ["application", "markdown", "csv"] },
        { id: "builtin.markdown.newspaper", name: "Newspaper", targets: ["markdown"] },
        { id: "builtin.csv.ledger", name: "Ledger", targets: ["csv"] },
      ],
    });

    const themeMenu = service.createApplicationMenuTemplate()
      .find((item) => item.id === "themes");
    expect(themeMenu.label).toBe("Theme");
    expect(themeMenu.submenu.map((item) => item.label).filter(Boolean)).toEqual([
      "Visual Variant",
      "Open Themes Folder",
    ]);
    expect(themeMenu.submenu[0].submenu.map((item) => item.label)).toEqual([
      "Neutral",
      "Warm",
      "Forest",
    ]);
    expect(themeMenu.submenu[0].submenu.find((item) => item.label === "Forest"))
      .toMatchObject({ type: "radio", checked: true });
    expect(themeMenu.submenu[0].submenu.find((item) => item.label === "My Custom CSS"))
      .toBeUndefined();
    expect(themeMenu.submenu[0].submenu.find((item) => item.label === "Newspaper"))
      .toBeUndefined();
    expect(themeMenu.submenu[0].submenu.find((item) => item.label === "Ledger"))
      .toBeUndefined();

    themeMenu.submenu[0].submenu.find((item) => item.label === "Neutral").click();
    themeMenu.submenu.at(-1).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(actions.selectTheme).toHaveBeenCalledWith({ kind: "pack", themeId: "default.neutral" });
    expect(actions.selectTheme).toHaveBeenCalledTimes(1);
    expect(actions.openThemesDirectory).toHaveBeenCalledOnce();
  });

  it("keeps CmdOrCtrl+0 available for the native View menu reset zoom accelerator", () => {
    const { service } = createHarness();
    const accelerators = service.createApplicationMenuTemplate().flatMap((item) => (
      item.submenu?.map((entry) => entry.accelerator).filter(Boolean) ?? []
    ));

    expect(accelerators).not.toContain("CmdOrCtrl+0");
  });

  it("does not replace native menus outside macOS", () => {
    const { app, Menu, service } = createHarness({ platform: "linux" });

    expect(service.refresh()).toEqual({ supported: false });
    expect(Menu.buildFromTemplate).not.toHaveBeenCalled();
    expect(Menu.setApplicationMenu).not.toHaveBeenCalled();
    expect(app.dock.setMenu).not.toHaveBeenCalled();
  });
});
