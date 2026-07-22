import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import {
  findWelcomeChannel,
  buildWelcomeEmbed,
  buildOwnerDmEmbed,
  sendOnboarding,
} from "../../../src/modules/onboarding/welcome.js";
import { buildWelcomeCard, WELCOME_FILENAME } from "../../../src/modules/onboarding/card.js";

const BOT_ID = "bot1";

// A stand-in text channel. `sendableBy` lists the ids that pass the perm check.
function channel({ id, name, type = "text", sendableBy = [BOT_ID], send } = {}) {
  return {
    id,
    name,
    isTextBased: () => type === "text",
    permissionsFor: (uid) => ({
      has: (perm) =>
        sendableBy.includes(uid) &&
        [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages].includes(perm),
    }),
    send: send ?? vi.fn(async () => {}),
  };
}

function guild({ channels = [], systemChannelId = null, name = "Test Guild", owner } = {}) {
  return {
    id: "g1",
    name,
    systemChannelId,
    iconURL: () => "https://cdn/icon.png",
    channels: { cache: new Map(channels.map((c) => [c.id, c])) },
    fetchOwner: owner ?? vi.fn(async () => ({ send: vi.fn(async () => {}) })),
  };
}

describe("findWelcomeChannel", () => {
  it("prefers a commands channel over general", () => {
    const commands = channel({ id: "c1", name: "commands" });
    const general = channel({ id: "c2", name: "general" });
    const g = guild({ channels: [general, commands] });
    expect(findWelcomeChannel(g, BOT_ID)).toBe(commands);
  });

  it("prefers bot-commands ahead of general and commands", () => {
    const botCmds = channel({ id: "c1", name: "bot-commands" });
    const commands = channel({ id: "c2", name: "commands" });
    const general = channel({ id: "c3", name: "general" });
    const g = guild({ channels: [general, commands, botCmds] });
    expect(findWelcomeChannel(g, BOT_ID)).toBe(botCmds);
  });

  it("falls back to the system channel when no named channel matches", () => {
    const random = channel({ id: "c1", name: "random" });
    const system = channel({ id: "sys", name: "welcome-here" });
    const g = guild({ channels: [random, system], systemChannelId: "sys" });
    expect(findWelcomeChannel(g, BOT_ID)).toBe(system);
  });

  it("falls back to the first sendable text channel", () => {
    const random = channel({ id: "c1", name: "random" });
    const g = guild({ channels: [random] });
    expect(findWelcomeChannel(g, BOT_ID)).toBe(random);
  });

  it("skips channels the bot cannot send in", () => {
    const locked = channel({ id: "c1", name: "commands", sendableBy: [] });
    const open = channel({ id: "c2", name: "general" });
    const g = guild({ channels: [locked, open] });
    expect(findWelcomeChannel(g, BOT_ID)).toBe(open);
  });

  it("ignores non-text channels", () => {
    const voice = channel({ id: "c1", name: "general", type: "voice" });
    const g = guild({ channels: [voice] });
    expect(findWelcomeChannel(g, BOT_ID)).toBeNull();
  });

  it("returns null when there is nowhere to speak", () => {
    expect(findWelcomeChannel(guild({ channels: [] }), BOT_ID)).toBeNull();
  });
});

describe("onboarding embeds", () => {
  it("welcome embed names the guild and lists all three setup commands", () => {
    const data = buildWelcomeEmbed(guild({ name: "Cool Server" })).toJSON();
    expect(data.title).toContain("Suzune");
    expect(data.description).toContain("Cool Server");
    const steps = data.fields[0].value;
    expect(steps).toContain("/scan");
    expect(steps).toContain("/antinuke");
    expect(steps).toContain("/dashboard");
  });

  it("includes support, community and uptime links", () => {
    const links = buildWelcomeEmbed(guild()).toJSON().fields[1].value;
    expect(links).toContain("discord.gg/kBtwmBsr6B");
    expect(links).toContain("discord.gg/QEykkuk6Gq");
    expect(links).toContain("stats.uptimerobot.com/0Ah1eJjOBW");
  });

  it("owner DM embed mentions the owner and keeps the steps", () => {
    const data = buildOwnerDmEmbed(guild({ name: "Cool Server" }), { id: "owner1" }).toJSON();
    expect(data.description).toContain("Thanks for adding me, <@owner1>!");
    expect(data.description).toContain("Cool Server");
    expect(data.fields[0].value).toContain("/scan");
  });

  it("owner DM embed degrades gracefully without an owner", () => {
    const data = buildOwnerDmEmbed(guild(), undefined).toJSON();
    expect(data.description).toContain("Thanks for adding me, there!");
  });

  it("attaches the banner image when an image name is given", () => {
    const withImg = buildWelcomeEmbed(guild(), { imageName: WELCOME_FILENAME }).toJSON();
    expect(withImg.image.url).toBe(`attachment://${WELCOME_FILENAME}`);
    const withoutImg = buildWelcomeEmbed(guild()).toJSON();
    expect(withoutImg.image).toBeUndefined();
  });
});

describe("buildWelcomeCard", () => {
  it("renders a non-empty PNG buffer", () => {
    const png = buildWelcomeCard();
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.length).toBeGreaterThan(0);
    // PNG magic number.
    expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});

describe("sendOnboarding", () => {
  const ctx = () => ({ client: { user: { id: BOT_ID } }, logger: { info: vi.fn(), warn: vi.fn() } });

  it("DMs the owner and posts to the welcome channel", async () => {
    const ownerSend = vi.fn(async () => {});
    const chan = channel({ id: "c1", name: "general" });
    const g = guild({ channels: [chan], owner: vi.fn(async () => ({ id: "owner1", send: ownerSend })) });

    await sendOnboarding(ctx(), g);

    expect(ownerSend).toHaveBeenCalledOnce();
    expect(chan.send).toHaveBeenCalledOnce();
    // The DM mentions the owner who added the bot.
    expect(ownerSend.mock.calls[0][0].embeds[0].toJSON().description).toContain("<@owner1>");
    // Both messages carry the banner attachment.
    expect(ownerSend.mock.calls[0][0].files[0].name).toBe(WELCOME_FILENAME);
    expect(chan.send.mock.calls[0][0].files[0].name).toBe(WELCOME_FILENAME);
  });

  it("still greets the server when the owner DM fails", async () => {
    const chan = channel({ id: "c1", name: "general" });
    const g = guild({
      channels: [chan],
      owner: vi.fn(async () => ({ send: vi.fn(async () => { throw new Error("DMs closed"); }) })),
    });

    await expect(sendOnboarding(ctx(), g)).resolves.toBeUndefined();
    expect(chan.send).toHaveBeenCalledOnce();
  });

  it("does not throw when there is no sendable channel", async () => {
    const g = guild({ channels: [] });
    await expect(sendOnboarding(ctx(), g)).resolves.toBeUndefined();
  });
});
