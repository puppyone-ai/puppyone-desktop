import {
  Cloud,
  ExternalLink,
  FileText,
  FlaskConical,
  GitBranch,
  Languages,
  Monitor,
  Pencil,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { SettingsSection } from "../types";

export type SettingsSidebarItem = {
  id: SettingsSection;
  labelId: string;
  icon: LucideIcon;
  disabled: boolean;
};

export type SettingsSidebarGroupModel = {
  id: string;
  labelId: string;
  items: readonly SettingsSidebarItem[];
};

export const SETTINGS_SIDEBAR_GROUPS = [
  {
    id: "desktop-app",
    labelId: "settings.sidebar.desktopApp",
    items: [
      { id: "workspace", labelId: "settings.sidebar.general", icon: Settings, disabled: false },
      { id: "language", labelId: "settings.sidebar.language", icon: Languages, disabled: false },
      { id: "appearance", labelId: "settings.sidebar.appearance", icon: Monitor, disabled: false },
      { id: "external-apps", labelId: "settings.sidebar.defaultApps", icon: ExternalLink, disabled: false },
      { id: "editor", labelId: "settings.sidebar.editor", icon: Pencil, disabled: false },
      { id: "experimental", labelId: "settings.sidebar.experimental", icon: FlaskConical, disabled: false },
    ],
  },
  {
    id: "workspace",
    labelId: "settings.sidebar.workspace",
    items: [
      { id: "git", labelId: "settings.sidebar.git", icon: GitBranch, disabled: false },
      { id: "files", labelId: "settings.sidebar.gitIgnore", icon: FileText, disabled: false },
    ],
  },
  {
    id: "cloud",
    labelId: "settings.sidebar.cloud",
    items: [
      { id: "account", labelId: "settings.sidebar.account", icon: UserRound, disabled: false },
      { id: "cloud", labelId: "settings.sidebar.cloudHosting", icon: Cloud, disabled: false },
    ],
  },
] satisfies readonly SettingsSidebarGroupModel[];
