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
  presentation: "catalog" | "generic";
  categories: AutomationCatalogCategory[];
  iconUrl: string | null;
};

type AutomationTemplateBlueprint = Omit<AutomationTemplate, "sourceLabel" | "iconUrl" | "presentation"> & {
  popularRank?: number;
};

export const AUTOMATION_CATEGORIES: Array<{ id: AutomationCatalogCategory }> = [
  { id: "popular" },
  { id: "documents" },
  { id: "knowledge" },
  { id: "collaboration" },
  { id: "data" },
  { id: "engineering" },
];

const AUTOMATION_TEMPLATE_BLUEPRINTS: AutomationTemplateBlueprint[] = [
  {
    id: "google-docs",
    provider: "google_docs",
    categories: ["popular", "documents", "knowledge"],
    popularRank: 1,
  },
  {
    id: "google-sheets",
    provider: "google_sheets",
    categories: ["popular", "documents", "data"],
    popularRank: 2,
  },
  {
    id: "gmail-updates",
    provider: "gmail",
    categories: ["popular", "collaboration", "knowledge"],
    popularRank: 3,
  },
  {
    id: "web-research",
    provider: "url",
    categories: ["popular", "knowledge", "data"],
    popularRank: 4,
  },
  {
    id: "calendar-events",
    provider: "google_calendar",
    categories: ["collaboration", "knowledge"],
  },
  {
    id: "search-console",
    provider: "google_search_console",
    categories: ["data"],
  },
  {
    id: "notion-knowledge",
    provider: "notion",
    categories: ["popular", "knowledge"],
    popularRank: 5,
  },
  {
    id: "slack-channels",
    provider: "slack",
    categories: ["popular", "collaboration", "knowledge"],
    popularRank: 6,
  },
  {
    id: "linear-projects",
    provider: "linear",
    categories: ["popular", "collaboration", "engineering"],
    popularRank: 7,
  },
  {
    id: "airtable-bases",
    provider: "airtable",
    categories: ["data", "collaboration"],
  },
  {
    id: "supabase-tables",
    provider: "supabase",
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
          presentation: "generic" as const,
          categories: ["data"] as AutomationCatalogCategory[],
          iconUrl: provider.icon_url ?? null,
          popularRank: Number.POSITIVE_INFINITY,
        };
      }
      return {
        ...blueprint,
        sourceLabel: provider.display_name,
        presentation: "catalog" as const,
        iconUrl: provider.icon_url ?? null,
        popularRank: blueprint.popularRank ?? Number.POSITIVE_INFINITY,
      };
    })
    .sort((left, right) => left.popularRank - right.popularRank || left.provider.localeCompare(right.provider))
    .map(({ popularRank: _popularRank, ...template }) => template);
}

export function getAutomationTemplatesForCategory(
  templates: AutomationTemplate[],
  category: AutomationCatalogCategory,
): AutomationTemplate[] {
  const matching = templates.filter((template) => template.categories.includes(category));
  return category === "popular" ? matching.slice(0, 4) : matching;
}
