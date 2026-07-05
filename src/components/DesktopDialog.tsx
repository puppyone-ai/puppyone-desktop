import { useRef, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";

export function DesktopDialogRoot({
  children,
  onClose,
  dismissOnBackdrop = true,
  className = "",
}: {
  children: ReactNode;
  onClose?: () => void;
  dismissOnBackdrop?: boolean;
  className?: string;
}) {
  const pointerStartedOnBackdropRef = useRef(false);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStartedOnBackdropRef.current = event.target === event.currentTarget;
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const clickedBackdrop = event.target === event.currentTarget;
    if (dismissOnBackdrop && pointerStartedOnBackdropRef.current && clickedBackdrop) {
      onClose?.();
    }
    pointerStartedOnBackdropRef.current = false;
  };

  return (
    <div
      className={`desktop-dialog-backdrop ${className}`.trim()}
      role="presentation"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}

export function DesktopDialogSurface({
  children,
  className = "",
  width,
  style,
}: {
  children: ReactNode;
  className?: string;
  width?: number | string;
  style?: CSSProperties;
}) {
  const surfaceStyle = {
    ...(width === undefined ? null : { "--desktop-dialog-width": typeof width === "number" ? `${width}px` : width }),
    ...style,
  } as CSSProperties;

  return (
    <div
      className={`desktop-dialog-surface ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      style={surfaceStyle}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function DesktopDialogCloseButton({
  title = "Close",
  disabled,
  onClick,
}: {
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="desktop-dialog-icon-button"
      type="button"
      disabled={disabled}
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M5 5L11 11M11 5L5 11"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
