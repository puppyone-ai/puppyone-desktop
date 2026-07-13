import {
  SidebarRoot,
  SidebarScrollArea,
  type SidebarRootProps,
  type SidebarScrollAreaProps,
} from "@puppyone/shared-ui";
import { type ReactNode } from "react";

export type SidebarSurfaceProps = SidebarRootProps & {
  header?: ReactNode;
  scrollAreaProps?: SidebarScrollAreaProps;
};

export function SidebarSurface({
  children,
  header,
  scrollAreaProps,
  ...rootProps
}: SidebarSurfaceProps) {
  return (
    <SidebarRoot {...rootProps}>
      {header}
      <SidebarScrollArea {...scrollAreaProps}>{children}</SidebarScrollArea>
    </SidebarRoot>
  );
}
