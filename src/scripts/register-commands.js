import { REST, Routes } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";
import { loadEnv } from "../config/env.js";
import { discoverCommands, buildCommandMap, toJSON } from "../core/CommandHandler.js";

const env = loadEnv();
const modulesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "modules");

const commands = buildCommandMap(await discoverCommands(modulesDir));
const body = toJSON(commands);
const rest = new REST({ version: "10" }).setToken(env.token);

const route = env.devGuildId
  ? Routes.applicationGuildCommands(env.clientId, env.devGuildId)
  : Routes.applicationCommands(env.clientId);

const data = await rest.put(route, { body });
console.log(`Registered ${data.length} commands ${env.devGuildId ? "to dev guild" : "globally"}.`);
