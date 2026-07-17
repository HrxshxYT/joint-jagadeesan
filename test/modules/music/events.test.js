import { describe, it, expect, vi } from "vitest";
import rawEvent from "../../../src/modules/music/events/raw.js";
import readyEvent from "../../../src/modules/music/events/ready.js";
import interactionEvent from "../../../src/modules/music/events/interactionCreate.js";

describe("raw event", () => {
  it("forwards packets to the music service", () => {
    const ctx = { music: { sendRawData: vi.fn() } };
    rawEvent.execute(ctx, { t: "VOICE_SERVER_UPDATE" });
    expect(ctx.music.sendRawData).toHaveBeenCalledWith({ t: "VOICE_SERVER_UPDATE" });
  });
});

describe("ready event", () => {
  it("initialises the manager when music is enabled", async () => {
    const ctx = { music: { isEnabled: true, init: vi.fn(async () => {}) }, logger: { info: vi.fn() } };
    await readyEvent.execute(ctx, { user: { id: "1", username: "Suzune" } });
    expect(ctx.music.init).toHaveBeenCalledWith({ id: "1", username: "Suzune" });
  });

  it("skips init when music is disabled", async () => {
    const ctx = { music: { isEnabled: false, init: vi.fn() }, logger: { info: vi.fn() } };
    await readyEvent.execute(ctx, { user: { id: "1" } });
    expect(ctx.music.init).not.toHaveBeenCalled();
  });
});

describe("music interaction router", () => {
  const ctx = { music: { isEnabled: true, getPlayer: () => undefined } };

  it("ignores non-music buttons", async () => {
    const i = { isButton: () => true, customId: "ticket:close", reply: vi.fn() };
    await interactionEvent.execute(ctx, i);
    expect(i.reply).not.toHaveBeenCalled();
  });

  it("ignores non-button interactions", async () => {
    const i = { isButton: () => false, customId: "music:skip", reply: vi.fn() };
    await interactionEvent.execute(ctx, i);
    expect(i.reply).not.toHaveBeenCalled();
  });

  it("routes music buttons to the control handler", async () => {
    const i = {
      isButton: () => true,
      customId: "music:pause",
      guildId: "g1",
      member: { voice: { channelId: "v" } },
      reply: vi.fn(async () => {}),
    };
    await interactionEvent.execute(ctx, i);
    // No player → handler replies ephemerally, proving it was routed.
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
