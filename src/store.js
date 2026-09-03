import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { emptyState } from "./core.js";

export class JsonStore {
  constructor(path) {
    this.path = path;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return emptyState();
      throw error;
    }
  }

  async write(state) {
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    await this.queue;
    return state;
  }

  async update(callback) {
    let result;
    this.queue = this.queue.then(async () => {
      const state = await this.read();
      result = await callback(state);
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    await this.queue;
    return result;
  }
}
