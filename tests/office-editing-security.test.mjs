import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { registerOfficeEditingIpcHandlers } from "../electron/main/ipc/office-editing-ipc.mjs";

describe("managed Office editing security boundary", () => {
  it("keeps Document Server topology, callbacks, and secrets out of Desktop configuration", async () => {
    const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");

    expect(example).not.toMatch(/^PUPPYONE_OFFICE_(?:DOCUMENT_SERVER_URL|JWT_SECRET|BRIDGE|DOWNLOAD)/m);
    expect(example).toContain("Office editing is a PuppyOne-managed Cloud capability");
    expect(example).toContain("no Document Server URL, JWT, callback listener, or Docker configuration");
  });

  it("authorizes the workspace root before upload and binds all mutations to sender ownership", async () => {
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

    const sessionId = "11111111-1111-4111-8111-111111111111";
    await handlers.get("office-editing:force-save")(event, { sessionId });
    expect(service.forceSave).toHaveBeenCalledWith({ ownerId: 73, sessionId });
  });
});
