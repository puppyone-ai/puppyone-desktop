import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type DesktopMenuSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
};

export const DesktopMenuSurface = forwardRef<HTMLDivElement, DesktopMenuSurfaceProps>(function DesktopMenuSurface(
  {
    ariaLabel,
    children,
    className,
    role = "menu",
    ...props
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx("desktop-menu-surface", className)}
      role={role}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </div>
  );
});

export function DesktopMenuSection({
  children,
  className,
  label,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label?: ReactNode;
}) {
  return (
    <section className={cx("desktop-menu-section", className)} {...props}>
      {label !== undefined && <div className="desktop-menu-section-label">{label}</div>}
      <div className="desktop-menu-section-list">{children}</div>
    </section>
  );
}

export function DesktopMenuSeparator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("desktop-menu-separator", className)} aria-hidden="true" {...props} />;
}

export type DesktopMenuItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  detail?: ReactNode;
  destructive?: boolean;
  icon?: ReactNode;
  label: ReactNode;
  selected?: boolean;
  trailing?: ReactNode;
};

export function DesktopMenuItem({
  className,
  detail,
  destructive,
  icon,
  label,
  role = "menuitem",
  selected,
  trailing,
  ...props
}: DesktopMenuItemProps) {
  return (
    <button
      className={cx("desktop-menu-item", selected && "selected", destructive && "danger", className)}
      type="button"
      role={role}
      {...props}
    >
      {icon !== undefined && <span className="desktop-menu-item-icon">{icon}</span>}
      <span className="desktop-menu-item-body">
        <span className="desktop-menu-item-label">{label}</span>
        {detail !== undefined && <span className="desktop-menu-item-detail">{detail}</span>}
      </span>
      {trailing !== undefined && <span className="desktop-menu-item-trailing">{trailing}</span>}
    </button>
  );
}
