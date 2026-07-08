import type { MarkdownTableAlignment, MarkdownTableStructureOperation } from "../../rendering/tableModel";
import {
  dispatchMarkdownTableStructureOperation,
  type MarkdownTableDispatchContext,
} from "./tableDispatch";
import {
  closeActiveMarkdownTableMenu,
  isActiveMarkdownTableMenu,
  setActiveMarkdownTableMenu,
} from "./tableMenuState";

export type MarkdownTableMenuScope = "cell" | "column" | "row";

type MarkdownTableMenuItem = {
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  operation: MarkdownTableStructureOperation;
  selected?: boolean;
  trailing?: string;
};

type MarkdownTableMenuSection = {
  label?: string;
  items: MarkdownTableMenuItem[];
};

export function showMarkdownTableContextMenu(
  context: MarkdownTableDispatchContext,
  target: {
    clientX: number;
    clientY: number;
    columnCount: number;
    columnIndex: number;
    rowCount: number;
    rowIndex: number;
    scope?: MarkdownTableMenuScope;
  },
) {
  closeActiveMarkdownTableMenu();
  const document = context.view.dom.ownerDocument;
  const menu = document.createElement("div");
  menu.className = "desktop-menu-surface cm-md-table-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Table actions");
  menu.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  for (const section of getMarkdownTableMenuSections(context, target)) {
    menu.appendChild(createMarkdownTableMenuSection(document, context, section));
  }

  document.body.appendChild(menu);
  positionMarkdownTableMenu(menu, target.clientX, target.clientY);

  const win = document.defaultView;
  const onPointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    closeActiveMarkdownTableMenu();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeActiveMarkdownTableMenu();
  };
  const cleanup = () => {
    menu.remove();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    win?.removeEventListener("resize", closeActiveMarkdownTableMenu);
    win?.removeEventListener("scroll", closeActiveMarkdownTableMenu, true);
  };
  setActiveMarkdownTableMenu({ cleanup, element: menu });

  win?.setTimeout(() => {
    if (!isActiveMarkdownTableMenu(menu)) return;
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    win.addEventListener("resize", closeActiveMarkdownTableMenu);
    win.addEventListener("scroll", closeActiveMarkdownTableMenu, true);
  }, 0);
}

function getMarkdownTableMenuSections(
  context: MarkdownTableDispatchContext,
  target: {
    columnCount: number;
    columnIndex: number;
    rowCount: number;
    rowIndex: number;
    scope?: MarkdownTableMenuScope;
  },
): MarkdownTableMenuSection[] {
  const { columnCount, columnIndex, rowCount, rowIndex } = target;
  const scope = target.scope ?? "cell";
  const currentAlignment = context.alignments[columnIndex] ?? null;
  const alignmentItems: Array<{ alignment: MarkdownTableAlignment; label: string }> = [
    { alignment: null, label: "Default alignment" },
    { alignment: "left", label: "Align left" },
    { alignment: "center", label: "Align center" },
    { alignment: "right", label: "Align right" },
  ];

  const sections: MarkdownTableMenuSection[] = [
    {
      label: "Rows",
      items: [
        {
          disabled: rowIndex === 0,
          label: "Insert row above",
          operation: { type: "insert-row-above", rowIndex, columnIndex },
        },
        {
          label: "Insert row below",
          operation: { type: "insert-row-below", rowIndex, columnIndex },
        },
        {
          label: "Duplicate row",
          operation: { type: "duplicate-row", rowIndex, columnIndex },
        },
        {
          disabled: rowIndex <= 1,
          label: "Move row up",
          operation: { type: "move-row-up", rowIndex, columnIndex },
        },
        {
          disabled: rowIndex === 0 || rowIndex >= rowCount - 1,
          label: "Move row down",
          operation: { type: "move-row-down", rowIndex, columnIndex },
        },
        {
          destructive: true,
          disabled: rowIndex === 0,
          label: "Delete row",
          operation: { type: "delete-row", rowIndex, columnIndex },
        },
      ],
    },
    {
      label: "Columns",
      items: [
        {
          label: "Insert column left",
          operation: { type: "insert-column-left", rowIndex, columnIndex },
        },
        {
          label: "Insert column right",
          operation: { type: "insert-column-right", rowIndex, columnIndex },
        },
        {
          disabled: columnIndex === 0,
          label: "Move column left",
          operation: { type: "move-column-left", rowIndex, columnIndex },
        },
        {
          disabled: columnIndex >= columnCount - 1,
          label: "Move column right",
          operation: { type: "move-column-right", rowIndex, columnIndex },
        },
        {
          destructive: true,
          disabled: columnCount <= 1,
          label: "Delete column",
          operation: { type: "delete-column", rowIndex, columnIndex },
        },
      ],
    },
    {
      label: "Alignment",
      items: alignmentItems.map(({ alignment, label }) => ({
        label,
        operation: {
          type: "set-column-alignment",
          rowIndex,
          columnIndex,
          alignment,
        },
        selected: currentAlignment === alignment,
      })),
    },
    {
      items: [{
        destructive: true,
        label: "Delete table",
        operation: { type: "delete-table", rowIndex, columnIndex },
      }],
    },
  ];

  if (scope === "row") {
    return sections.filter((section) => section.label === "Rows");
  }
  if (scope === "column") {
    return sections.filter((section) => section.label === "Columns" || section.label === "Alignment");
  }
  return sections;
}

function createMarkdownTableMenuSection(
  document: Document,
  context: MarkdownTableDispatchContext,
  section: MarkdownTableMenuSection,
): HTMLElement {
  const sectionElement = document.createElement("section");
  sectionElement.className = "desktop-menu-section";
  if (section.label) {
    const label = document.createElement("div");
    label.className = "desktop-menu-section-label";
    label.textContent = section.label;
    sectionElement.appendChild(label);
  }

  const list = document.createElement("div");
  list.className = "desktop-menu-section-list";
  for (const item of section.items) {
    list.appendChild(createMarkdownTableMenuItem(document, context, item));
  }
  sectionElement.appendChild(list);
  return sectionElement;
}

function createMarkdownTableMenuItem(
  document: Document,
  context: MarkdownTableDispatchContext,
  item: MarkdownTableMenuItem,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.className = [
    "desktop-menu-item",
    item.destructive ? "danger" : "",
    item.selected ? "selected" : "",
  ].filter(Boolean).join(" ");
  button.disabled = item.disabled === true;

  const body = document.createElement("span");
  body.className = "desktop-menu-item-body";
  const label = document.createElement("span");
  label.className = "desktop-menu-item-label";
  label.textContent = item.label;
  body.appendChild(label);
  button.appendChild(body);

  if (item.trailing) {
    const trailing = document.createElement("span");
    trailing.className = "desktop-menu-item-trailing";
    trailing.textContent = item.trailing;
    button.appendChild(trailing);
  }

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;
    dispatchMarkdownTableStructureOperation(context, item.operation);
  });
  return button;
}

function positionMarkdownTableMenu(menu: HTMLElement, clientX: number, clientY: number) {
  const win = menu.ownerDocument.defaultView;
  const margin = 8;
  menu.style.position = "fixed";
  menu.style.left = "0";
  menu.style.top = "0";
  menu.style.visibility = "hidden";
  const rect = menu.getBoundingClientRect();
  const viewportWidth = win?.innerWidth ?? 0;
  const viewportHeight = win?.innerHeight ?? 0;
  const left = Math.max(margin, Math.min(clientX, viewportWidth - rect.width - margin));
  const top = Math.max(margin, Math.min(clientY, viewportHeight - rect.height - margin));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "";
}
