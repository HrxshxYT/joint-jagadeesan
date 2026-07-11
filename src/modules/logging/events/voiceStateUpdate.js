import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { voiceEmbed } from "../embeds.js";

export default {
  name: Events.VoiceStateUpdate,
  async execute(ctx, oldState, newState) {
    if (oldState.channelId === newState.channelId) return; // mute/deaf toggles, not a move
    const guild = newState.guild ?? oldState.guild;
    await logEvent(ctx, guild, "voice", voiceEmbed(oldState, newState));
  },
};
