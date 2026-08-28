import fs from "node:fs";
import path from "node:path";

export function createAtomicJsonFile({ filePath, fsModule = fs }) {
  if (typeof filePath !== "string" || !filePath) {
    throw new TypeError("A telemetry storage file path is required.");
  }
  const fsPromises = fsModule.promises;

  return Object.freeze({
    async read() {
      try {
        return JSON.parse(await fsPromises.readFile(filePath, "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
        throw error;
      }
    },

    async write(value) {
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      const payload = `${JSON.stringify(value, null, 2)}\n`;
      try {
        await fsPromises.writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
        await fsPromises.rename(temporaryPath, filePath);
      } catch (error) {
        await fsPromises.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
      }
    },

    async remove() {
      await fsPromises.rm(filePath, { force: true });
    },
  });
}
