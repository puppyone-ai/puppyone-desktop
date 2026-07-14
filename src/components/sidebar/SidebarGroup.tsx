import { type HTMLAttributes, type ReactNode, useId } from "react";

export type SidebarGroupProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title?: ReactNode;
  label?: string;
  disabled?: boolean;
};

export function SidebarGroup({
  children,
  className,
  disabled = false,
  label,
  title,
  ...props
}: SidebarGroupProps) {
  const generatedId = useId();
  const titleId = title == null ? undefined : `po-sidebar-group-${generatedId}`;

  return (
    <div
      className={["po-desktop-sidebar-group", className]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label={title == null ? label : undefined}
      aria-labelledby={titleId}
      data-disabled={disabled || undefined}
      {...props}
    >
      {title != null && (
        <div className="po-desktop-sidebar-group__header">
          <div
            className="po-desktop-sidebar-group__title"
            id={titleId}
          >
            {title}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
