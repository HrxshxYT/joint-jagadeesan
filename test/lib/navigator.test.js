import { describe, it, expect, vi } from "vitest";
import { runPager, runToggler } from "../../src/lib/navigator.js";
import { EmbedBuilder } from "discord.js";

function fakeInteraction() {
  const message = {};
  return {
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => message),
    editReply: vi.fn(async () => {}),
    _message: message,
  };
}

// awaitFn that returns a scripted list of clicks then null forever
function scriptedAwait(clicks) {
  let n = 0;
  return vi.fn(async () => (n < clicks.length ? clicks[n++] : null));
}

describe("runPager", () => {
  it("moves to the next page on a next click, then stops on timeout", async () => {
    const interaction = fakeInteraction();
    const render = vi.fn((page) => new EmbedBuilder().setTitle(`page ${page}`));
    const next = { customId: "page:next:u1", update: vi.fn(async () => {}) };
    const awaitFn = scriptedAwait([next]);
    await runPager({ interaction, count: 3, render, ownerId: "u1", awaitFn, timeMs: 10 });
    // rendered page 0 initially and page 1 after the next click
    expect(interaction.reply).toHaveBeenCalled();
    expect(next.update).toHaveBeenCalled();
    const lastRenderPage = render.mock.calls.at(-1)[0];
    expect(lastRenderPage).toBe(1);
  });

  it("does not attach a pager when there is only one page", async () => {
    const interaction = fakeInteraction();
    await runPager({
      interaction,
      count: 1,
      render: () => new EmbedBuilder(),
      ownerId: "u1",
      awaitFn: scriptedAwait([]),
    });
    const payload = interaction.reply.mock.calls[0][0];
    expect(payload.components).toEqual([]);
  });
});

describe("runToggler", () => {
  it("calls onToggle with the clicked key and re-renders", async () => {
    const interaction = fakeInteraction();
    const onToggle = vi.fn(async () => {});
    const click = { customId: "toggle:spam:u1", update: vi.fn(async () => {}) };
    await runToggler({
      interaction,
      buildItems: () => [{ key: "spam", label: "Spam", on: true }],
      onToggle,
      renderEmbed: () => new EmbedBuilder().setTitle("panel"),
      ownerId: "u1",
      awaitFn: scriptedAwait([click]),
      timeMs: 10,
    });
    expect(onToggle).toHaveBeenCalledWith("spam");
    expect(click.update).toHaveBeenCalled();
  });
});
