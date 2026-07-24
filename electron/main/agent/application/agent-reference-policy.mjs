import {
  normalizeAuthorizedReferences,
  normalizePrompt,
  normalizeReferenceDisplays,
  requireSupportedAgentReferences,
} from "./agent-input-policy.mjs";

export function prepareAgentTurnReferenceInput(request, capabilities) {
  const references = normalizeAuthorizedReferences([
    ...(Array.isArray(request?.references) ? request.references : []),
    ...(Array.isArray(request?.contextReferences) ? request.contextReferences : []),
    ...(Array.isArray(request?.attachments) ? request.attachments : []),
  ]);
  requireSupportedAgentReferences(capabilities, references);
  return {
    references,
    referenceDisplays: normalizeReferenceDisplays(references),
    privateReferencePaths: new Map(references.flatMap((reference) => reference.kind === "staged-attachment"
      ? [
          [reference.path, reference.displayName],
          ...(typeof reference.snapshotUrl === "string" ? [[reference.snapshotUrl, reference.displayName]] : []),
        ]
      : [])),
    prompt: normalizePrompt(request?.prompt, {
      allowEmpty: references.length > 0 && capabilities?.referenceInputs?.attachmentOnly === true,
    }),
  };
}

export function beginAgentTurnReferences(session, request) {
  const input = prepareAgentTurnReferenceInput(request, session.capabilities);
  session.pendingPrompt = input.prompt;
  session.pendingReferenceDisplays = input.referenceDisplays;
  session.privateReferencePaths = input.privateReferencePaths;
  session.activeReferenceTokens = privateReferenceLeaseTokens(request);
  return input;
}

export function abandonAgentTurnReferences(session) {
  session.pendingPrompt = null;
  session.pendingReferenceDisplays = [];
  session.privateReferencePaths.clear();
  session.activeReferenceTokens = [];
}

export function prepareAgentSteerReferenceInput(request, capabilities) {
  const references = normalizeAuthorizedReferences(request?.references);
  if (references.length > 0 && capabilities?.referenceInputs?.steer !== true) {
    throw new Error("The active Agent runtime does not support references while steering.");
  }
  requireSupportedAgentReferences(capabilities, references);
  return {
    references,
    message: normalizePrompt(request?.message, {
      allowEmpty: references.length > 0 && capabilities?.referenceInputs?.attachmentOnly === true,
    }),
  };
}

export function scrubPrivateReferencePaths(value, replacements, depth = 0) {
  if (depth > 12 || !replacements?.size) return value;
  if (typeof value === "string") {
    let output = value;
    for (const [privatePath, displayName] of replacements) {
      output = output.split(privatePath).join(`[attachment:${displayName}]`);
    }
    return output;
  }
  if (Array.isArray(value)) return value.map((entry) => scrubPrivateReferencePaths(entry, replacements, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    scrubPrivateReferencePaths(entry, replacements, depth + 1),
  ]));
}

export function privateReferenceLeaseTokens(request) {
  const lease = request?.privateReferenceLease;
  if (!lease || typeof lease !== "object" || typeof lease.leaseId !== "string") return [];
  return Array.from(new Set((Array.isArray(lease.tokens) ? lease.tokens : [])
    .filter((token) => typeof token === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(token))))
    .slice(0, 32);
}

export async function revokeActiveAgentReferences(session, attachmentStore) {
  const tokens = Array.isArray(session?.activeReferenceTokens) ? session.activeReferenceTokens.splice(0) : [];
  const revoke = attachmentStore?.revokeLeased ?? attachmentStore?.revoke;
  if (tokens.length === 0 || typeof revoke !== "function") return;
  await revoke.call(attachmentStore, {
    ownerId: session.ownerId,
    workspaceRoot: session.workspaceRoot,
    tokens,
  }).catch(() => undefined);
}

export async function withAgentSteerReferenceTokens(session, request, invoke) {
  const previous = session.activeReferenceTokens;
  session.activeReferenceTokens = Array.from(new Set([...previous, ...privateReferenceLeaseTokens(request)]));
  try {
    return await invoke();
  } catch (error) {
    session.activeReferenceTokens = session.activeTurnId ? previous : [];
    throw error;
  }
}
