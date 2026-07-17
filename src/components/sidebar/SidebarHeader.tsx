import { type HTMLAttributes, type ReactNode } from "react";

export type SidebarHeaderProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  actions?: ReactNode;
};

export function SidebarHeader({ actions, className, title, ...props }: SidebarHeaderProps) {
  return (
    <header
      className={["po-desktop-sidebar-header", className].filter(Boolean).join(" ")}
      {...props}
    >
      <div className="po-desktop-sidebar-header__title">{title}</div>
      {actions != null && <div className="po-desktop-sidebar-header__actions">{actions}</div>}
    </header>
  );
}
