import { useRef, type CSSProperties, type Key, type ReactNode } from "react";
import { joinSidebarClassNames } from "./classNames";
import { useVirtualSidebarWindow } from "./useVirtualSidebarWindow";

export type VirtualSidebarListProps<T> = {
  items: readonly T[];
  rowSize: number;
  renderRow: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => Key;
  activeIndex?: number | null;
  ariaLabel?: string;
  className?: string;
  maxMountedRows?: number;
  overscan?: number;
};

export function VirtualSidebarList<T>({
  activeIndex = null,
  ariaLabel,
  className,
  getKey,
  items,
  maxMountedRows,
  overscan,
  renderRow,
  rowSize,
}: VirtualSidebarListProps<T>) {
  const scrollRef = useRef<HTMLOListElement>(null);
  const windowState = useVirtualSidebarWindow({
    activeIndex,
    maxMountedRows,
    overscan,
    rowCount: items.length,
    rowSize,
    scrollRef,
  });
  const visibleItems = items.slice(windowState.startIndex, windowState.endIndex);
  const leadingSpacerStyle = {
    "--po-sidebar-virtual-spacer-size": `${windowState.offsetTop}px`,
  } as CSSProperties;
  const trailingSpacerStyle = {
    "--po-sidebar-virtual-spacer-size": `${Math.max(
      0,
      windowState.totalHeight - windowState.offsetTop - visibleItems.length * rowSize,
    )}px`,
  } as CSSProperties;
  const rowStyle = { "--po-sidebar-virtual-row-size": `${rowSize}px` } as CSSProperties;

  return (
    <ol
      ref={scrollRef}
      className={joinSidebarClassNames("po-sidebar-virtual-scroll", className)}
      aria-label={ariaLabel}
      onScroll={windowState.onScroll}
    >
      {windowState.offsetTop > 0 && (
        <li className="po-sidebar-virtual-spacer" style={leadingSpacerStyle} aria-hidden="true" />
      )}
      {visibleItems.map((item, visibleIndex) => {
        const index = windowState.startIndex + visibleIndex;
        return (
          <li className="po-sidebar-virtual-row" style={rowStyle} key={getKey(item, index)}>
            {renderRow(item, index)}
          </li>
        );
      })}
      {windowState.endIndex < items.length && (
        <li className="po-sidebar-virtual-spacer" style={trailingSpacerStyle} aria-hidden="true" />
      )}
    </ol>
  );
}
