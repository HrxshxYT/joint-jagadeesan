import { Events } from "discord.js";

// Lavalink needs the raw VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE gateway packets
// to establish the voice connection.
export default {
  name: Events.Raw,
  execute(ctx, packet) {
    ctx.music?.sendRawData(packet);
  },
};
