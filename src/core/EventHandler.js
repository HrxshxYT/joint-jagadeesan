import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function bindEvents(client, listeners, context) {
  for (const listener of listeners) {
    const handler = (...args) => listener.execute(context, ...args);
    if (listener.once) {
      client.once(listener.name, handler);
    } else {
      client.on(listener.name, handler);
    }
  }
}

export async function discoverEvents(dir) {
  const listeners = [];
  const moduleDirs = await readdir(dir, { withFileTypes: true });
  for (const md of moduleDirs) {
    if (!md.isDirectory()) continue;
    const evDir = join(dir, md.name, "events");
    let files;
    try {
      files = await readdir(evDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      const mod = await import(pathToFileURL(join(evDir, file)).href);
      if (mod.default) listeners.push(mod.default);
    }
  }
  return listeners;
}
