import { describe, it, expect, vi } from "vitest";
import { handleWelcomeComponent } from "../../../src/modules/welcome/panel/handlers.js";

const ctx = () => ({ config: { updateWelcome: vi.fn(async () => ({})) } });
const baseState = () => ({
  guildId: "g1",
  ownerId: "o1",
  welcome: {
    welcomeEnabled: false, welcomeChannelId: null, welcomeMessage: "hi",
    goodbyeEnabled: false, goodbyeChannelId: null, goodbyeMessage: "bye",
  },
});
const render = () => ({ embeds: [], components: [] });

describe("handleWelcomeComponent", () => {
  it("toggles welcomeEnabled and persists", async () => {
    const c = ctx();
    const s = baseState();
    const dir = await handleWelcomeComponent({ customId: "we:tog:welcomeEnabled:o1", user: { id: "o1" } }, s, c, render);
    expect(dir).toBe("update");
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", { welcomeEnabled: true });
    expect(s.welcome.welcomeEnabled).toBe(true);
  });

  it("setting the welcome channel also enables welcomes", async () => {
    const c = ctx();
    const s = baseState();
    await handleWelcomeComponent({ customId: "we:ch:welcome:o1", values: ["c9"], user: { id: "o1" } }, s, c, render);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", { welcomeChannelId: "c9", welcomeEnabled: true });
    expect(s.welcome.welcomeChannelId).toBe("c9");
    expect(s.welcome.welcomeEnabled).toBe(true);
  });

  it("previews both templates ephemerally without persisting", async () => {
    const c = ctx();
    const s = baseState();
    const reply = vi.fn(async () => {});
    const i = {
      customId: "we:preview:o1",
      user: { id: "o1" },
      member: { id: "o1", user: { tag: "me#1", username: "me" } },
      guild: { name: "Guild", memberCount: 5 },
      reply,
    };
    const dir = await handleWelcomeComponent(i, s, c, render);
    expect(dir).toBe("handled");
    expect(reply).toHaveBeenCalled();
    expect(c.config.updateWelcome).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0].ephemeral).toBe(true);
  });

  it("returns 'close' for the close button", async () => {
    const dir = await handleWelcomeComponent({ customId: "we:close:o1", user: { id: "o1" } }, baseState(), ctx(), render);
    expect(dir).toBe("close");
  });
});
