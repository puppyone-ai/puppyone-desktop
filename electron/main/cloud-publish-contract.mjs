// Compatibility facade. New implementation code imports the canonical module
// directly; older Cloud Git modules can migrate without creating two models.
export * from "./cloud-initialization/contract.mjs";
