import fs from "node:fs";
import path from "node:path";

const PREFERENCE_VERSION = 1;

export function createLocalePreferenceStore({ filePath, fsModule = fs }) {
  if (typeof filePath !== "string" || !filePath) {
    throw new TypeError("A locale preference file path is required.");
  }
  const fsPromises = fsModule.promises;

  return Object.freeze({
    async read() {
      try {
        const source = await fsPromises.readFile(filePath, "utf8");
        const value = JSON.parse(source);
        if (value?.version !== PREFERENCE_VERSION || typeof value?.language !== "string") {
          return "system";
        }
        return value.language;
      } catch (error) {
        if (error?.code === "ENOENT") return "system";
        if (error instanceof SyntaxError) return "system";
        throw error;
      }
    },

    async write(language) {
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      const payload = `${JSON.stringify({ version: PREFERENCE_VERSION, language }, null, 2)}\n`;
      try {
        await fsPromises.writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
        await fsPromises.rename(temporaryPath, filePath);
      } catch (error) {
        await fsPromises.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
      }
    },
  });
}
