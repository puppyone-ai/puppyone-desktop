import type { DesktopCloudAutomationProviderSpec } from "../../lib/cloudApi";

export type AutomationCatalogCategory =
  | "popular"
  | "documents"
  | "knowledge"
  | "collaboration"
  | "data"
  | "engineering";

export type AutomationTemplate = {
  id: string;
  provider: string;
  sourceLabel: string;
  title: string;
  description: string;
  categories: AutomationCatalogCategory[];
  iconUrl: string | null;
};

type AutomationTemplateBlueprint = Omit<AutomationTemplate, "sourceLabel" | "iconUrl"> & {
  popularRank?: number;
};

export const AUTOMATION_CATEGORIES: Array<{ id: AutomationCatalogCategory; label: string }> = [
  { id: "popular", label: "Popular" },
  { id: "documents", label: "Documents" },
  { id: "knowledge", label: "Knowledge" },
  { id: "collaboration", label: "Collaboration" },
  { id: "data", label: "Data & Research" },
  { id: "engineering", label: "Engineering" },
];

const AUTOMATION_TEMPLATE_BLUEPRINTS: AutomationTemplateBlueprint[] = [
  {
    id: "google-docs",
    provider: "google_docs",
    title: "Collect Google Docs",
    description: "Bring shared documents into this project and refresh them when the source changes.",
    categories: ["popular", "documents", "knowledge"],
    popularRank: 1,
  },
  {
    id: "google-sheets",
    provider: "google_sheets",
    title: "Import Google Sheets",
    description: "Bring operational tables into a project folder for analysis, agents, and reporting.",
    categories: ["popular", "documents", "data"],
    popularRank: 2,
  },
  {
    id: "gmail-updates",
    provider: "gmail",
    title: "Capture Gmail updates",
    description: "Keep important messages and recurring updates available as durable project context.",
    categories: ["popular", "collaboration", "knowledge"],
    popularRank: 3,
  },
  {
    id: "web-research",
    provider: "url",
    title: "Track a web source",
    description: "Save a web page into this project and keep its research context up to date.",
    categories: ["popular", "knowledge", "data"],
    popularRank: 4,
  },
  {
    id: "calendar-events",
    provider: "google_calendar",
    title: "Collect Calendar events",
    description: "Turn selected events and schedules into structured, searchable project context.",
    categories: ["collaboration", "knowledge"],
  },
  {
    id: "search-console",
    provider: "google_search_console",
    title: "Monitor Search Console",
    description: "Bring search performance signals into the project for recurring analysis and reporting.",
    categories: ["data"],
  },
  {
    id: "notion-knowledge",
    provider: "notion",
    title: "Mirror Notion knowledge",
    description: "Keep selected pages and databases mirrored in a searchable project folder.",
    categories: ["popular", "knowledge"],
    popularRank: 5,
  },
  {
    id: "slack-channels",
    provider: "slack",
    title: "Archive Slack channels",
    description: "Capture important messages and threads as durable, searchable project knowledge.",
    categories: ["popular", "collaboration", "knowledge"],
    popularRank: 6,
  },
  {
    id: "linear-projects",
    provider: "linear",
    title: "Mirror Linear projects",
    description: "Keep issues, projects, and status updates available as structured project context.",
    categories: ["popular", "collaboration", "engineering"],
    popularRank: 7,
  },
  {
    id: "airtable-bases",
    provider: "airtable",
    title: "Mirror Airtable bases",
    description: "Turn selected records and views into versioned, queryable project data.",
    categories: ["data", "collaboration"],
  },
  {
    id: "supabase-tables",
    provider: "supabase",
    title: "Snapshot Supabase tables",
    description: "Bring the tables your team needs into a controlled project data surface.",
    categories: ["data", "engineering"],
  },
];

export function buildAutomationTemplates(
  providers: DesktopCloudAutomationProviderSpec[],
): AutomationTemplate[] {
  const datasourceProviders = providers.filter((provider) => provider.category === "datasource");
  const blueprints = new Map(AUTOMATION_TEMPLATE_BLUEPRINTS.map((template) => [template.provider, template]));

  return datasourceProviders
    .map((provider) => {
      const blueprint = blueprints.get(provider.provider);
      if (!blueprint) {
        return {
          id: `provider-${provider.provider}`,
          provider: provider.provider,
          sourceLabel: provider.display_name,
          title: `Automate ${provider.display_name}`,
          description: provider.description || `Keep ${provider.display_name} data current in this project.`,
          categories: ["data"] as AutomationCatalogCategory[],
          iconUrl: provider.icon_url ?? null,
          popularRank: Number.POSITIVE_INFINITY,
        };
      }
      return {
        ...blueprint,
        sourceLabel: provider.display_name,
        iconUrl: provider.icon_url ?? null,
        popularRank: blueprint.popularRank ?? Number.POSITIVE_INFINITY,
      };
    })
    .sort((left, right) => left.popularRank - right.popularRank || left.title.localeCompare(right.title))
    .map(({ popularRank: _popularRank, ...template }) => template);
}

export function getAutomationTemplatesForCategory(
  templates: AutomationTemplate[],
  category: AutomationCatalogCategory,
): AutomationTemplate[] {
  const matching = templates.filter((template) => template.categories.includes(category));
  return category === "popular" ? matching.slice(0, 4) : matching;
}
