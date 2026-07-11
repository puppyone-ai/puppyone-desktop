const RUNTIME_ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9:._-]{1,256}$/;

export function optionalRecord(value, label) {
  if (value === undefined || value === null) return {};
  return assertRecord(value, `${label} request`);
}

export function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw contractError(label, "must be an object");
  return value;
}

export function assertArray(value, label) {
  if (!Array.isArray(value)) throw contractError(label, "must be an array");
  return value;
}

export function requiredString(value, label, limit, { allowEmpty = false, preserveWhitespace = false } = {}) {
  if (typeof value !== "string") throw contractError(label, "must be text");
  const normalized = preserveWhitespace ? value : value.trim();
  if (!allowEmpty && normalized.trim().length === 0) throw contractError(label, "must not be empty");
  if (normalized.length > limit) throw contractError(label, `exceeds ${limit} characters`);
  return normalized;
}

export function optionalString(value, label, limit) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, label, limit);
}

export function isRuntimeId(value) {
  return typeof value === "string" && RUNTIME_ID_PATTERN.test(value);
}

export function assertRuntimeId(value, label) {
  if (!isRuntimeId(value)) throw contractError(label, "is invalid");
  return value;
}

export function optionalRuntimeId(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return assertRuntimeId(value, "runtimeId");
}

export function requiredOpaqueId(value, label) {
  if (!isOpaqueId(value)) throw contractError(label, "is invalid");
  return value;
}

export function optionalOpaqueId(value, label, { nullable = false } = {}) {
  if (value === undefined || value === "" || (nullable && value === null)) return value;
  return requiredOpaqueId(value, label);
}

export function isOpaqueId(value) {
  return typeof value === "string" && OPAQUE_ID_PATTERN.test(value);
}

export function optionalBoolean(value, label) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw contractError(label, "must be a boolean");
  return value;
}

export function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw contractError(label, "must be a non-negative integer");
  return value;
}

export function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw contractError(label, "must be a positive integer");
  return value;
}

export function enumValue(value, label, allowed) {
  if (!allowed.includes(value)) throw contractError(label, `must be one of ${allowed.join(", ")}`);
  return value;
}

export function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function contractError(path, reason) {
  return new TypeError(`Invalid Agent contract: ${path} ${reason}.`);
}
