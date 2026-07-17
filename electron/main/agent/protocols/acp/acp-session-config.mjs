export function resolveAcpModels({ configOptions, models } = {}) {
  const selected = selectConfig(configOptions, "model");
  const available = selected
    ? flattenOptions(selected.options).map((option) => ({
      id: text(option.value),
      name: text(option.name) || text(option.value),
      description: text(option.description),
    }))
    : array(models?.availableModels).map((model) => ({
      id: text(model?.id),
      name: text(model?.name) || text(model?.id),
      description: text(model?.description),
    }));
  return {
    configId: selected?.id ?? null,
    currentId: text(selected?.currentValue) || text(models?.currentModelId) || null,
    available: available.filter((entry) => entry.id).slice(0, 500),
  };
}

export function resolveAcpModes({ configOptions, modes } = {}) {
  const selected = selectConfig(configOptions, "mode");
  const available = selected
    ? flattenOptions(selected.options).map((option) => ({
      id: text(option.value),
      name: text(option.name) || text(option.value),
      description: text(option.description),
    }))
    : array(modes?.availableModes).map((mode) => ({
      id: text(mode?.id),
      name: text(mode?.name) || text(mode?.id),
      description: text(mode?.description),
    }));
  return {
    configId: selected?.id ?? null,
    currentId: text(selected?.currentValue) || text(modes?.currentModeId) || null,
    available: available.filter((entry) => entry.id).slice(0, 100),
  };
}

export function resolveAcpEfforts({ configOptions } = {}) {
  const selected = selectConfig(configOptions, "thought_level") ?? selectConfig(configOptions, "effort");
  return {
    configId: selected?.id ?? null,
    currentId: text(selected?.currentValue) || null,
    available: selected
      ? flattenOptions(selected.options).map((option) => ({
        id: text(option.value),
        name: text(option.name) || text(option.value),
        description: text(option.description),
      })).filter((entry) => entry.id).slice(0, 32)
      : [],
  };
}

export function resolveRequestedAcpMode(requested, state) {
  const value = text(requested).toLowerCase();
  if (!value) return state.currentId ?? state.available[0]?.id ?? null;
  const exact = state.available.find((entry) => entry.id.toLowerCase() === value);
  if (exact) return exact.id;
  const semantic = value === "plan"
    ? state.available.find((entry) => /plan/i.test(`${entry.id} ${entry.name}`))
    : state.available.find((entry) => /(?:puppyone|build|agent|default)/i.test(`${entry.id} ${entry.name}`));
  return semantic?.id ?? state.currentId ?? state.available[0]?.id ?? null;
}

function selectConfig(value, category) {
  const comparable = String(category).toLowerCase();
  const candidates = array(value).filter((entry) => entry?.type === "select");
  return candidates.find((entry) => text(entry.category).toLowerCase() === comparable)
    ?? candidates.find((entry) => text(entry.id).toLowerCase() === comparable)
    ?? null;
}

function flattenOptions(value) {
  const options = array(value);
  return options.flatMap((entry) => Array.isArray(entry?.options) ? entry.options : [entry]);
}

function text(value) {
  return typeof value === "string" ? value.trim().slice(0, 2_000) : "";
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

