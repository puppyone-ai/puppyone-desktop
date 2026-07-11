/**
 * Registry for the single active table context menu. Lives in its own module
 * so the menu (which registers) and the dispatch/drag layers (which close or
 * query it) do not need to import each other.
 */
let activeMarkdownTableMenu: { cleanup: () => void; element: HTMLElement } | null = null;

export function setActiveMarkdownTableMenu(menu: { cleanup: () => void; element: HTMLElement }) {
  activeMarkdownTableMenu = menu;
}

export function isActiveMarkdownTableMenu(element: HTMLElement): boolean {
  return activeMarkdownTableMenu?.element === element;
}

export function hasActiveMarkdownTableMenu(): boolean {
  return activeMarkdownTableMenu !== null;
}

export function closeActiveMarkdownTableMenu() {
  const active = activeMarkdownTableMenu;
  activeMarkdownTableMenu = null;
  active?.cleanup();
}
