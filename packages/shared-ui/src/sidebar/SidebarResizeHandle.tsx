import { forwardRef, type HTMLAttributes, type KeyboardEvent } from "react";
import { joinSidebarClassNames } from "./classNames";

export type SidebarResizeIntent = "decrease" | "increase" | "minimum" | "maximum";

export type SidebarResizeHandleProps = Omit<HTMLAttributes<HTMLDivElement>, "onKeyDown"> & {
  label: string;
  orientation: "horizontal" | "vertical";
  value?: number;
  min?: number;
  max?: number;
  onKeyboardResize?: (intent: SidebarResizeIntent, accelerated: boolean) => void;
};

export const SidebarResizeHandle = forwardRef<HTMLDivElement, SidebarResizeHandleProps>(function SidebarResizeHandle(
  {
    className,
    label,
    max,
    min,
    onKeyboardResize,
    orientation,
    role = "separator",
    tabIndex = 0,
    value,
    ...props
  },
  ref,
) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onKeyboardResize) return;
    const decreaseKey = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
    const increaseKey = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
    let intent: SidebarResizeIntent | null = null;
    if (event.key === decreaseKey) intent = "decrease";
    else if (event.key === increaseKey) intent = "increase";
    else if (event.key === "Home") intent = "minimum";
    else if (event.key === "End") intent = "maximum";
    if (!intent) return;
    event.preventDefault();
    onKeyboardResize(intent, event.shiftKey);
  };

  return (
    <div
      ref={ref}
      className={joinSidebarClassNames("po-sidebar-resize-handle", className)}
      role={role}
      tabIndex={tabIndex}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});
