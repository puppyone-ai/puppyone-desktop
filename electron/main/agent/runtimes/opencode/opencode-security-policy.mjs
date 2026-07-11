const SAFE_READ_PATTERNS = Object.freeze([
  { pattern: "*", action: "allow" },
  { pattern: "*.env", action: "ask" },
  { pattern: "*.env.*", action: "ask" },
  { pattern: "*.env.example", action: "allow" },
]);

const SAFE_LOCAL_PERMISSIONS = Object.freeze([
  "glob",
  "grep",
  "question",
  "skill",
  "todowrite",
  "plan_enter",
  "plan_exit",
]);

/**
 * Rules are appended to the native agent rules, and OpenCode resolves the last
 * matching rule. Unknown, plugin and MCP tools therefore ask by default while
 * bounded workspace reads and presentation-only tools remain usable.
 */
export function createOpenCodeSessionPermissions(mode) {
  const planMode = normalizeMode(mode) === "plan";
  const rules = [
    { permission: "*", pattern: "*", action: planMode ? "deny" : "ask" },
    ...SAFE_READ_PATTERNS.map(({ pattern, action }) => ({ permission: "read", pattern, action })),
    ...SAFE_LOCAL_PERMISSIONS.map((permission) => ({ permission, pattern: "*", action: "allow" })),
  ];
  return rules;
}

export function openCodePolicyKey(mode) {
  return normalizeMode(mode) === "plan" ? "plan" : "interactive";
}

export const OPEN_CODE_LOCKED_ENVIRONMENT = Object.freeze({
  OPENCODE_AUTO_SHARE: "false",
  OPENCODE_DISABLE_AUTOUPDATE: "1",
  OPENCODE_DISABLE_CLAUDE_CODE: "1",
  OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
  OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
  OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  OPENCODE_DISABLE_SHARE: "1",
  OPENCODE_ENABLE_QUESTION_TOOL: "true",
  OPENCODE_PURE: "1",
});

function normalizeMode(mode) {
  return typeof mode === "string" ? mode.trim().toLowerCase() : "";
}
