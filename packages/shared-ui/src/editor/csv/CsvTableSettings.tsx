"use client";

import type { MessageFormatter } from "@puppyone/localization/core";
import { AlertTriangle, Check, Settings2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type CsvTableSettingsProps = Readonly<{
  columnCount: number;
  dataRowCount: number;
  direction: "ltr" | "rtl";
  headerEnabled: boolean;
  hiddenRowCount: number;
  nodeName: string;
  onHeaderEnabledChange: (enabled: boolean) => void;
  t: MessageFormatter;
  visibleDataRowCount: number;
  warning?: "unclosed-quote";
}>;

export function CsvTableSettings({
  columnCount,
  dataRowCount,
  direction,
  headerEnabled,
  hiddenRowCount,
  nodeName,
  onHeaderEnabledChange,
  t,
  visibleDataRowCount,
  warning,
}: CsvTableSettingsProps) {
  const [open, setOpen] = useState(false);
  const headerDescriptionId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasNotice = Boolean(warning || hiddenRowCount > 0);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const button = buttonRef.current;
    if (!menu || !button) return;
    const document = menu.ownerDocument;
    menu.querySelector<HTMLButtonElement>(".desktop-menu-item")?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menu.contains(event.target) || button.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      button.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="csv-table-editor__settings" dir={direction}>
      <button
        ref={buttonRef}
        type="button"
        className="csv-table-editor__settings-button"
        data-notice={hasNotice ? "true" : undefined}
        aria-label={t("editor.csv.settings")}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t("editor.csv.settings")}
        onClick={() => setOpen((current) => !current)}
      >
        <Settings2 size={15} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="desktop-menu-surface po-editable-table-context-menu csv-table-editor__settings-menu"
          role="menu"
          aria-label={t("editor.csv.settings")}
        >
          <div className="csv-table-editor__settings-summary">
            <strong dir="auto">{nodeName}</strong>
            <span>
              {t(headerEnabled ? "editor.csv.dimensionsWithHeader" : "editor.csv.dimensions", {
                rows: dataRowCount,
                columns: columnCount,
              })}
            </span>
          </div>

          {hasNotice && (
            <div className="csv-table-editor__settings-notices" role="status">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>
                {warning
                  ? t("editor.csv.warning.unclosedQuote")
                  : t("editor.csv.visibleRows", { visible: visibleDataRowCount, total: dataRowCount })}
              </span>
            </div>
          )}

          <section className="desktop-menu-section" role="group">
            <div className="desktop-menu-section-list">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={headerEnabled}
                aria-describedby={headerDescriptionId}
                className={`desktop-menu-item csv-table-editor__settings-item${headerEnabled ? " selected" : ""}`}
                onClick={() => onHeaderEnabledChange(!headerEnabled)}
              >
                <span className="desktop-menu-item-body">
                  <span className="desktop-menu-item-label">{t("editor.csv.header")}</span>
                  <span
                    id={headerDescriptionId}
                    className="csv-table-editor__settings-item-description"
                  >
                    {t("editor.csv.headerDescription")}
                  </span>
                </span>
                <span className="csv-table-editor__settings-check" aria-hidden="true">
                  {headerEnabled && <Check size={14} />}
                </span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
