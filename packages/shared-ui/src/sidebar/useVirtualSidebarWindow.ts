import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

export type VirtualSidebarWindowOptions = {
  rowCount: number;
  rowSize: number;
  scrollRef: RefObject<HTMLElement | null>;
  activeIndex?: number | null;
  overscan?: number;
  maxMountedRows?: number;
  fallbackViewportHeight?: number;
};

export type VirtualSidebarWindow = {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetTop: number;
  onScroll: () => void;
};

export function useVirtualSidebarWindow({
  activeIndex = null,
  fallbackViewportHeight = 640,
  maxMountedRows = 120,
  overscan = 10,
  rowCount,
  rowSize,
  scrollRef,
}: VirtualSidebarWindowOptions): VirtualSidebarWindow {
  const [viewport, setViewport] = useState({ height: fallbackViewportHeight, scrollTop: 0 });
  const animationFrameRef = useRef<number | null>(null);

  const readViewport = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const height = element.clientHeight || fallbackViewportHeight;
    const scrollTop = Math.max(0, element.scrollTop);
    setViewport((current) => (
      current.height === height && current.scrollTop === scrollTop
        ? current
        : { height, scrollTop }
    ));
  }, [fallbackViewportHeight, scrollRef]);

  const onScroll = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      readViewport();
    });
  }, [readViewport]);

  useLayoutEffect(() => {
    readViewport();
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(readViewport);
    observer.observe(element);
    return () => observer.disconnect();
  }, [readViewport, scrollRef]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const visibleWindow = useMemo(() => {
    const firstVisibleIndex = Math.floor(viewport.scrollTop / rowSize);
    const visibleCount = Math.max(1, Math.ceil(viewport.height / rowSize));
    const desiredCount = Math.min(maxMountedRows, visibleCount + overscan * 2);
    const startIndex = Math.max(
      0,
      Math.min(firstVisibleIndex - overscan, Math.max(0, rowCount - desiredCount)),
    );
    const endIndex = Math.min(rowCount, startIndex + desiredCount);
    return { startIndex, endIndex };
  }, [maxMountedRows, overscan, rowCount, rowSize, viewport.height, viewport.scrollTop]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || activeIndex === null || activeIndex < 0 || activeIndex >= rowCount) return;
    const rowTop = activeIndex * rowSize;
    const rowBottom = rowTop + rowSize;
    const viewportTop = element.scrollTop;
    const viewportBottom = viewportTop + (element.clientHeight || fallbackViewportHeight);
    if (rowTop < viewportTop) element.scrollTop = rowTop;
    else if (rowBottom > viewportBottom) {
      element.scrollTop = Math.max(0, rowBottom - (element.clientHeight || viewport.height));
    } else return;
    readViewport();
  }, [activeIndex, fallbackViewportHeight, readViewport, rowCount, rowSize, scrollRef, viewport.height]);

  return {
    ...visibleWindow,
    totalHeight: rowCount * rowSize,
    offsetTop: visibleWindow.startIndex * rowSize,
    onScroll,
  };
}
