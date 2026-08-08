import { describe, expect, it, vi } from "vitest";
import { loadOfficeEngineConfiguration } from "../electron/main/office/office-engine-config.mjs";
import { signOnlyOfficeJwt, verifyOnlyOfficeJwt } from "../electron/main/office/onlyoffice-jwt.mjs";
import { registerOfficeEditingIpcHandlers } from "../electron/main/ipc/office-editing-ipc.mjs";

describe("Office editing security boundary", () => {
  it("fails closed until both the engine URL and a strong shared secret exist", () => {
    expect(loadOfficeEngineConfiguration({})).toMatchObject({ configured: false });
    expect(loadOfficeEngineConfiguration({
      PUPPYONE_OFFICE_DOCUMENT_SERVER_URL: "https://office.example.test",
      PUPPYONE_OFFICE_JWT_SECRET: "short",
    })).toMatchObject({ configured: false });
    expect(loadOfficeEngineConfiguration({
      PUPPYONE_OFFICE_DOCUMENT_SERVER_URL: "http://office.example.test",
      PUPPYONE_OFFICE_JWT_SECRET: "a-secret-that-is-long-enough",
    })).toMatchObject({ configured: false });
    const configured = loadOfficeEngineConfiguration({
      PUPPYONE_OFFICE_DOCUMENT_SERVER_URL: "https://office.example.test",
      PUPPYONE_OFFICE_JWT_SECRET: "a-secret-that-is-long-enough",
    });
    expect(configured).toMatchObject({ configured: true, documentServerUrl: "https://office.example.test" });
    expect(configured.downloadOrigins).toEqual(new Set(["https://office.example.test"]));
  });

  it("signs HS256 session configuration and rejects any tampering", () => {
    const secret = "test-secret-with-at-least-sixteen-characters";
    const token = signOnlyOfficeJwt({ document: { key: "document-key" } }, secret);
    expect(verifyOnlyOfficeJwt(token, secret)).toMatchObject({ document: { key: "document-key" } });
    const parts = token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ document: { key: "tampered" } })).toString("base64url");
    expect(() => verifyOnlyOfficeJwt(parts.join("."), secret)).toThrow(/signature/i);
  });

  it("authorizes the workspace root before creating a session and binds mutations to sender ownership", async () => {
    const handlers = new Map();
    const service = {
      getAvailability: vi.fn(() => ({ available: true })),
      createSession: vi.fn(async (request) => request),
      forceSave: vi.fn(async (request) => request),
      closeSession: vi.fn(async (request) => request),
      resolveConflict: vi.fn(async (request) => request),
    };
    registerOfficeEditingIpcHandlers({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      officeEditingService: service,
      authorizeWorkspaceRoot: async (_event, requestedRoot) => {
        if (requestedRoot !== "/workspace") throw new Error("workspace root mismatch");
        return "/canonical-workspace";
      },
    });
    const event = { sender: { id: 73 } };

    await expect(handlers.get("office-editing:create-session")(event, {
      rootPath: "/spoofed",
      path: "book.xlsx",
    })).rejects.toThrow(/root mismatch/);
    expect(service.createSession).not.toHaveBeenCalled();

    await handlers.get("office-editing:create-session")(event, {
      rootPath: "/workspace",
      path: "book.xlsx",
    });
    expect(service.createSession).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 73,
      rootPath: "/canonical-workspace",
      relativePath: "book.xlsx",
    }));
  });
});
