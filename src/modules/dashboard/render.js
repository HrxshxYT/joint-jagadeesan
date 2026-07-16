import { EmbedBuilder } from "discord.js";

const DEV_CREDIT = "Developed by hrxshxforpresident";
export const CARD_FILENAME = "dashboard.png";

// A neon-style progress bar built from block characters, used in the embed's
// text fallback so the integrity index is still readable without the image.
export function integrityBar(pct, length = 18) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * length);
  return `${"█".repeat(filled)}${"░".repeat(length - filled)}`;
}

// Hosts the rendered dashboard card image. The image carries the full metric
// grid; the embed adds a searchable/accessible text summary of the status, the
// live security toggles and the member count, plus the dev-credit footer.
export function buildDashboardEmbeds(metrics) {
  const m = metrics;
  const sync = Math.floor(Date.now() / 1000);

  const systems = Object.entries(m.features)
    .map(([name, on]) => `${on ? "🟢" : "🔴"} **${name}** — ${on ? "Active" : "Offline"}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(m.tier.color)
    .setTitle("🛡️ ATHENA'S SECURITY DASHBOARD")
    .setDescription(
      [
        `**Status:** ${m.tier.label}`,
        `**Firewall:** ${m.firewall ? "Active" : "Offline"}`,
        `**Members:** ${m.members}`,
        `**Last Sync:** <t:${sync}:R>`,
        `**Live Monitoring:** Active`,
        "",
        `**Integrity:** \`${integrityBar(m.integrity)}\` ${m.integrity}%`,
      ].join("\n"),
    )
    .addFields({ name: ">> Security Systems", value: systems, inline: false })
    .setImage(`attachment://${CARD_FILENAME}`)
    .setFooter({ text: DEV_CREDIT })
    .setTimestamp();

  return [embed];
}
