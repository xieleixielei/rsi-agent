import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REGISTRY_VERSION = 1;

function requiredString(value, name, max) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`DeepSeek returned an invalid ${name}`);
  const result = value.trim();
  if (result.length > max) throw new Error(`DeepSeek returned ${name} longer than ${max} characters`);
  return result;
}

export function validateImprovementSpec(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DeepSeek returned an invalid plugin specification");
  const slug = requiredString(value.slug, "slug", 48);
  if (!SLUG_PATTERN.test(slug)) throw new Error("DeepSeek returned an invalid plugin slug");
  return {
    slug,
    title: requiredString(value.title, "title", 80),
    description: requiredString(value.description, "description", 240),
    prompt: requiredString(value.prompt, "prompt", 8000),
  };
}

export function renderGeneratedPlugin(plugin) {
  return `export const name = ${JSON.stringify(`rsi-generated-${plugin.slug}`)};\n`
    + `export const inject = ["systemPrompt"];\n\n`
    + `export function apply(ctx) {\n`
    + `  ctx.effect(() => ctx.systemPrompt.context({\n`
    + `    name: ${JSON.stringify(`rsi:generated:${plugin.slug}`)},\n`
    + `    order: 950,\n`
    + `    text: () => ${JSON.stringify(plugin.prompt)},\n`
    + `  }), ${JSON.stringify(`rsi-generated-${plugin.slug}.context()`)});\n`
    + `}\n`;
}

export function defaultManagedDir() {
  return path.join(homedir(), ".dsh", "rsi", "generated-plugins");
}

function publicPlugin(plugin) {
  return {
    id: plugin.id,
    slug: plugin.slug,
    title: plugin.title,
    description: plugin.description,
    enabled: plugin.enabled,
    createdAt: plugin.createdAt,
    model: plugin.model,
  };
}

function extractJson(content) {
  if (typeof content !== "string") throw new Error("DeepSeek response did not contain text");
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("DeepSeek response was not valid JSON");
  }
}

export class ImprovementManager {
  constructor(ctx, config, fetchImpl = globalThis.fetch) {
    this.ctx = ctx;
    this.config = config;
    this.fetch = fetchImpl;
    this.managedDir = config.managedPluginDir || defaultManagedDir();
    this.registryPath = path.join(this.managedDir, "registry.json");
    this.plugins = [];
    this.entryIds = new Map();
    this.mutation = Promise.resolve();
  }

  list() {
    return this.plugins.map(publicPlugin);
  }

  async initialize() {
    await mkdir(this.managedDir, { recursive: true });
    try {
      const value = JSON.parse(await readFile(this.registryPath, "utf8"));
      this.plugins = Array.isArray(value.plugins) ? value.plugins : [];
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await this.save();
    }
    for (const plugin of this.plugins.filter((item) => item.enabled)) {
      try {
        await this.load(plugin.id, false);
      } catch (error) {
        plugin.enabled = false;
        this.ctx.logger.warn("rsi: failed to restore generated plugin %s: %s", plugin.id, error.message);
      }
    }
    await this.save();
  }

  async save() {
    await mkdir(this.managedDir, { recursive: true });
    const temporary = `${this.registryPath}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: REGISTRY_VERSION, plugins: this.plugins }, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.registryPath);
  }

  serialize(work) {
    const next = this.mutation.then(work, work);
    this.mutation = next.catch(() => {});
    return next;
  }

  async generate(content, signal) {
    return this.serialize(async () => {
      // CredentialRef is a branded string at type level; runtime resolution stays inside Harness.
      const hit = await this.ctx.credentials.resolve(this.config.apiKeyEnv);
      if (!hit?.value) throw new Error(`Harness credential ${this.config.apiKeyEnv} is not configured`);
      const response = await this.fetch(`${this.config.deepSeekApiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        signal,
        headers: { authorization: `Bearer ${hit.value}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          model: this.config.deepSeekModel,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "Create one reusable DeepSeek Harness prompt improvement. Return JSON only with exactly these string fields: slug, title, description, prompt. slug must be lowercase kebab-case and at most 48 characters. The prompt must be a clear behavioral instruction, must preserve human control, and must not request credentials, execute code, bypass safety, or modify files.",
            },
            { role: "user", content },
          ],
        }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`DeepSeek API failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
      }
      const body = await response.json();
      const spec = validateImprovementSpec(extractJson(body?.choices?.[0]?.message?.content));
      const id = `${spec.slug}-${Date.now().toString(36)}`;
      const pluginDir = path.join(this.managedDir, id);
      await mkdir(pluginDir, { recursive: false });
      const plugin = { ...spec, id, path: path.join(pluginDir, "index.js"), enabled: false, createdAt: new Date().toISOString(), model: this.config.deepSeekModel };
      await writeFile(plugin.path, renderGeneratedPlugin(plugin), { mode: 0o600 });
      await writeFile(path.join(pluginDir, "package.json"), `${JSON.stringify({ name: `rsi-generated-${id}`, private: true, type: "module", main: "index.js" }, null, 2)}\n`, { mode: 0o600 });
      this.plugins.unshift(plugin);
      await this.load(id, false);
      await this.save();
      return publicPlugin(plugin);
    });
  }

  async load(id, persist = true) {
    const plugin = this.plugins.find((item) => item.id === id);
    if (!plugin) throw new Error("Unknown generated plugin");
    if (!this.entryIds.has(id)) {
      const entryId = await this.ctx.loader.create({ name: pathToFileURL(plugin.path).href });
      this.entryIds.set(id, entryId);
    }
    plugin.enabled = true;
    if (persist) await this.save();
    return publicPlugin(plugin);
  }

  async unload(id, persist = true) {
    const plugin = this.plugins.find((item) => item.id === id);
    if (!plugin) throw new Error("Unknown generated plugin");
    const entryId = this.entryIds.get(id);
    if (entryId) await this.ctx.loader.remove(entryId);
    this.entryIds.delete(id);
    plugin.enabled = false;
    if (persist) await this.save();
    return publicPlugin(plugin);
  }

  async setEnabled(id, enabled) {
    return this.serialize(() => enabled ? this.load(id) : this.unload(id));
  }

  async dispose() {
    for (const entryId of this.entryIds.values()) await this.ctx.loader.remove(entryId);
    this.entryIds.clear();
  }
}

export function createPluginApi(manager) {
  return async (request) => {
    if (request.method === "GET") return Response.json({ plugins: manager.list() });
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    try {
      const body = await request.json();
      if (typeof body?.id !== "string" || typeof body?.enabled !== "boolean") return Response.json({ error: "invalid request" }, { status: 400 });
      const plugin = await manager.setEnabled(body.id, body.enabled);
      return Response.json({ plugin });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
    }
  };
}
