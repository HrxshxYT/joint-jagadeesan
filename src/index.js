import { ShardingManager } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const botPath = join(dirname(fileURLToPath(import.meta.url)), "bot.js");

const manager = new ShardingManager(botPath, {
  token: env.token,
  totalShards: env.shardCount, // "auto" or a number
});

manager.on("shardCreate", (shard) => console.log(`Launched shard ${shard.id}`));
await manager.spawn();
