import { LIMITS } from "./constants.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

function stamp(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatTranscript(messages, meta) {
  const header = [
    `Ticket #${meta.number} — ${meta.categoryLabel ?? "General"}`,
    `Opened by: ${meta.openerTag ?? "unknown"}`,
    `Messages: ${messages.length}`,
    "".padEnd(40, "-"),
    "",
  ];
  const lines = messages.map((m) => {
    let line = `[${stamp(m.createdAt)} UTC] ${m.authorTag}: ${m.content || "[no text]"}`;
    if (m.attachments?.length) {
      line += `\n    attachments: ${m.attachments.join(", ")}`;
    }
    return line;
  });
  return [...header, ...lines].join("\n") + "\n";
}

export async function buildTranscript(channel, meta) {
  const collected = [];
  let before;
  while (collected.length < LIMITS.transcriptMaxMessages) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    for (const msg of batch.values()) collected.push(msg);
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const mapped = collected.map((m) => ({
    createdAt: m.createdAt,
    authorTag: m.author?.tag ?? m.author?.username ?? "unknown",
    content: m.content ?? "",
    attachments: [...(m.attachments?.values?.() ?? [])].map((a) => a.url),
  }));
  const text = formatTranscript(mapped, meta);
  return {
    buffer: Buffer.from(text, "utf8"),
    filename: `ticket-${meta.number}.txt`,
  };
}
