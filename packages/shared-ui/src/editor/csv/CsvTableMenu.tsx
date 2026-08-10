"use client";

import type { MessageFormatter } from "@puppyone/localization/core";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CsvTableStructureOperation } from "./csvTableOperations";

export type CsvTableMenuTarget = Readonly<{
  clientX: number;
  clientY: number;
  columnIndex: number;
  kind: "cell" | "column" | "row";
  menuId: string;
  restoreFocus: HTMLElement | null;
  rowIndex: number;
}>;

type CsvTableMenuProps = Readonly<{
  columnCount: number;
  direction: "ltr" | "rtl";
  headerEnabled: boolean;
  locale: string;
  onClose: (restoreFocus: boolean) => void;
  onOperation: (operation: CsvTableStructureOperation) => void;
  rowCount: number;
  t: MessageFormatter;
  target: CsvTableMenuTarget;
}>;

type CsvTableMenuItem = Readonly<{
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  operation: CsvTableStructureOperation;
}>;

type CsvTableMenuSection = Readonly<{
  id: "columns" | "rows";
  items: readonly CsvTableMenuItem[];
  label: string;
}>;

export function CsvTableMenu({
  columnCount,
  direction,
  headerEnabled,
  locale,
  onClose,
  onOperation,
  rowCount,
  t,
  target,
}: CsvTableMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstMovableRow = headerEnabled ? 1 : 0;
  const rowItems: readonly CsvTableMenuItem[] = [
        {
          disabled: target.rowIndex < firstMovableRow,
          label: t("editor.table.insertRowAbove"),
          operation: { type: "insert-row-above", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
        {
          label: t("editor.table.insertRowBelow"),
          operation: { type: "insert-row-below", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
        {
          disabled: target.rowIndex < firstMovableRow,
          label: t("editor.table.duplicateRow"),
          operation: { type: "duplicate-row", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
        {
          disabled: target.rowIndex <= firstMovableRow,
          label: t("editor.table.moveRowUp"),
          operation: { type: "move-row-up", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
        {
          disabled: target.rowIndex < firstMovableRow || target.rowIndex >= rowCount - 1,
          label: t("editor.table.moveRowDown"),
          operation: { type: "move-row-down", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
        {
          destructive: true,
          disabled: target.rowIndex < firstMovableRow,
          label: t("editor.table.deleteRow"),
          operation: { type: "delete-row", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
      ];
  const columnItems: readonly CsvTableMenuItem[] = [
        {
          label: t(direction === "rtl"
            ? "editor.table.insertColumnRight"
            : "editor.table.insertColumnLeft"),
          operation: { type: "insert-column-left", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
        {
          label: t(direction === "rtl"
            ? "editor.table.insertColumnLeft"
            : "editor.table.insertColumnRight"),
          operation: { type: "insert-column-right", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
        {
          disabled: target.columnIndex === 0,
          label: t(direction === "rtl"
            ? "editor.table.moveColumnRight"
            : "editor.table.moveColumnLeft"),
          operation: { type: "move-column-left", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
        {
          disabled: target.columnIndex >= columnCount - 1,
          label: t(direction === "rtl"
            ? "editor.table.moveColumnLeft"
            : "editor.table.moveColumnRight"),
          operation: { type: "move-column-right", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
        {
          destructive: true,
          disabled: columnCount <= 1,
          label: t("editor.table.deleteColumn"),
          operation: { type: "delete-column", rowIndex: target.rowIndex, columnIndex: target.columnIndex },
        },
      ];
  const sections: readonly CsvTableMenuSection[] = target.kind === "row"
    ? [{ id: "rows", label: t("editor.table.rows"), items: rowItems }]
    : target.kind === "column"
      ? [{ id: "columns", label: t("editor.table.columns"), items: columnItems }]
      : [
          { id: "rows", label: t("editor.table.rows"), items: rowItems },
          { id: "columns", label: t("editor.table.columns"), items: columnItems },
        ];

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const win = menu.ownerDocument.defaultView;
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = win?.innerWidth ?? 0;
    const viewportHeight = win?.innerHeight ?? 0;
    const preferredLeft = direction === "rtl" ? target.clientX - rect.width : target.clientX;
    menu.style.left = `${Math.max(margin, Math.min(preferredLeft, viewportWidth - rect.width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(target.clientY, viewportHeight - rect.height - margin))}px`;
    menu.style.visibility = "";
    const initialItem = getEnabledItems(menu)[0];
    if (initialItem) focusMenuItem(menu, initialItem);
    else menu.focus({ preventScroll: true });
  }, [direction, target.clientX, target.clientY]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const document = menu.ownerDocument;
    const win = document.defaultView;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && menu.contains(event.target)) return;
      onClose(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    };
    const closeWithoutRestore = () => onClose(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    win?.addEventListener("resize", closeWithoutRestore);
    win?.addEventListener("scroll", closeWithoutRestore, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      win?.removeEventListener("resize", closeWithoutRestore);
      win?.removeEventListener("scroll", closeWithoutRestore, true);
    };
  }, [onClose]);

  const menu = (
    <div
      ref={menuRef}
      id={target.menuId}
      className="desktop-menu-surface po-editable-table-context-menu csv-table-editor__context-menu"
      data-po-scrollbar="menu"
      role="menu"
      aria-label={t("editor.table.actions")}
      aria-orientation="vertical"
      dir={direction}
      tabIndex={-1}
      style={{ position: "fixed", left: 0, top: 0, visibility: "hidden" }}
      onBlur={() => {
        queueMicrotask(() => {
          const element = menuRef.current;
          if (element && !element.contains(element.ownerDocument.activeElement)) onClose(false);
        });
      }}
      onKeyDown={(event) => handleMenuKeyDown(event, locale, onClose)}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {sections.map((section) => (
        <section
          key={section.id}
          className="desktop-menu-section"
          role="group"
          aria-label={section.label}
        >
          <div className="desktop-menu-section-label">{section.label}</div>
          <div className="desktop-menu-section-list">
            {section.items.map((item) => (
              <button
                key={item.operation.type}
                type="button"
                role="menuitem"
                className={`desktop-menu-item${item.destructive ? " danger" : ""}`}
                disabled={item.disabled}
                tabIndex={-1}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (item.disabled) return;
                  onClose(false);
                  onOperation(item.operation);
                }}
              >
                <span className="desktop-menu-item-body">
                  <span className="desktop-menu-item-label">{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  const ownerDocument = target.restoreFocus?.ownerDocument ?? (typeof document === "undefined" ? null : document);
  const portalRoot = ownerDocument?.querySelector<HTMLElement>('[data-po-overlay-root="true"]')
    ?? ownerDocument?.body
    ?? null;
  return portalRoot ? createPortal(menu, portalRoot) : null;
}

function handleMenuKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  locale: string,
  onClose: (restoreFocus: boolean) => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onClose(true);
    return;
  }

  const menu = event.currentTarget;
  const items = getEnabledItems(menu);
  if (items.length === 0) return;
  const currentIndex = items.indexOf(menu.ownerDocument.activeElement as HTMLButtonElement);
  let nextItem: HTMLButtonElement | undefined;
  if (event.key === "ArrowDown") {
    nextItem = items[(currentIndex + 1 + items.length) % items.length];
  } else if (event.key === "ArrowUp") {
    nextItem = items[(currentIndex < 0 ? items.length - 1 : currentIndex - 1 + items.length) % items.length];
  } else if (event.key === "Home") {
    nextItem = items[0];
  } else if (event.key === "End") {
    nextItem = items[items.length - 1];
  } else if (event.key.length === 1 && event.key !== " " && !event.altKey && !event.ctrlKey && !event.metaKey) {
    const query = event.key.toLocaleLowerCase(locale);
    for (let offset = 1; offset <= items.length; offset += 1) {
      const index = (Math.max(currentIndex, -1) + offset) % items.length;
      const label = items[index]
        ?.querySelector(".desktop-menu-item-label")
        ?.textContent
        ?.trim()
        .toLocaleLowerCase(locale);
      if (label?.startsWith(query)) {
        nextItem = items[index];
        break;
      }
    }
  }
  if (!nextItem) return;
  event.preventDefault();
  event.stopPropagation();
  focusMenuItem(menu, nextItem);
}

function getEnabledItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('.desktop-menu-item:not(:disabled)'));
}

function focusMenuItem(menu: HTMLElement, target: HTMLButtonElement) {
  for (const item of getEnabledItems(menu)) item.tabIndex = item === target ? 0 : -1;
  target.focus({ preventScroll: true });
}
