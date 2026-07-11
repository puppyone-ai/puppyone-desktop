import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseEnvText,
  prepareLocalCloudDevServices,
  probeLocalCloudService,
  resolveLocalCloudDevConfig,
} from "../scripts/local-cloud-dev.mjs";

function missingFileError() {
  const error = new Error("missing");
  error.code = "ENOENT";
  return error;
}

function response({ body = "", json = null, ok = true, status = 200 } = {}) {
  return {
    json: vi.fn().mockResolvedValue(json),
    ok,
    status,
    text: vi.fn().mockResolvedValue(body),
  };
}

describe("local Cloud development services", () => {
  it("parses quoted Vite env values and strips unquoted comments", () => {
    expect(parseEnvText([
      "# comment",
      'VITE_DESKTOP_CLOUD_API_URL="http://localhost:9090/api/v1"',
      "PLAIN=value # trailing comment",
    ].join("\n"))).toEqual({
      PLAIN: "value",
      VITE_DESKTOP_CLOUD_API_URL: "http://localhost:9090/api/v1",
    });
  });

  it("enables the sibling Cloud stack only for a loopback API", () => {
    const desktopRoot = "/workspace/puppyone desktop";
    const readFile = vi.fn((filename) => {
      if (filename.endsWith(".env.local")) {
        return "VITE_DESKTOP_CLOUD_API_URL=http://localhost:9090/api/v1\n";
      }
      throw missingFileError();
    });

    expect(resolveLocalCloudDevConfig({
      desktopRoot,
      environment: {},
      readFile,
    })).toMatchObject({
      apiBaseUrl: "http://localhost:9090/api/v1",
      apiHealthUrl: "http://localhost:9090/health",
      apiHost: "127.0.0.1",
      apiPort: 9090,
      cloudRoot: path.resolve("/workspace/puppyone"),
      webOrigin: "http://localhost:3000",
      webPort: 3000,
    });

    expect(resolveLocalCloudDevConfig({
      desktopRoot,
      environment: { VITE_DESKTOP_CLOUD_API_URL: "https://api.puppyone.ai/api/v1" },
      readFile,
    })).toBeNull();

    expect(resolveLocalCloudDevConfig({
      desktopRoot,
      environment: { VITE_API_URL: "https://api.puppyone.ai/api/v1" },
      readFile,
    })).toMatchObject({ apiBaseUrl: "http://localhost:9090/api/v1" });
  });

  it("requires both API readiness and the real Puppyone login page", async () => {
    await expect(probeLocalCloudService(
      { healthUrl: "http://localhost:9090/health", kind: "api" },
      { fetchImpl: vi.fn().mockResolvedValue(response({ json: { status: "ready" } })) },
    )).resolves.toEqual({ ready: true });

    await expect(probeLocalCloudService(
      { healthUrl: "http://localhost:3000/login", kind: "web" },
      { fetchImpl: vi.fn().mockResolvedValue(response({ body: "<h1>Sign in to Puppyone</h1>" })) },
    )).resolves.toEqual({ ready: true });

    await expect(probeLocalCloudService(
      { healthUrl: "http://localhost:3000/login", kind: "web" },
      { fetchImpl: vi.fn().mockResolvedValue(response({ body: "<h1>Another app</h1>" })) },
    )).resolves.toEqual({ ready: false, detail: "login page marker is missing" });
  });

  it("reuses healthy sibling services without spawning duplicate processes", async () => {
    const desktopRoot = "/workspace/puppyone desktop";
    const config = resolveLocalCloudDevConfig({
      desktopRoot,
      environment: {
        PUPPYONE_CLOUD_DEV_ROOT: "/workspace/puppyone",
        VITE_DESKTOP_CLOUD_API_URL: "http://localhost:9090/api/v1",
      },
      readFile: () => {
        throw missingFileError();
      },
    });
    const fetchImpl = vi.fn(async (url) => (
      String(url).includes(":9090")
        ? response({ json: { status: "ready" } })
        : response({ body: "<title>Puppyone</title><p>Sign in</p>" })
    ));
    const spawn = vi.fn();
    const logger = { info: vi.fn() };

    const services = await prepareLocalCloudDevServices(config, {
      fetchImpl,
      logger,
      spawn,
    });

    expect(spawn).not.toHaveBeenCalled();
    expect(services.ownedProcesses).toEqual([]);
    await expect(services.probeAll()).resolves.toEqual([
      { name: "API", ready: true },
      { name: "login web app", ready: true },
    ]);
  });
});
