// src/bot/commands_handler.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { REST as DiscordREST, Routes } from "discord.js";
import Logger from "../utils/logger.js";

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ENV (Render → Environment)
const DISCORD_CLIENT_ID = (process.env.DISCORD_CLIENT_ID || "").trim();
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const DISCORD_COMMAND_CHANNEL_ID = (process.env.DISCORD_COMMAND_CHANNEL_ID || "").trim();

// Snowflake ellenőrzés
const isSnowflake = (s) => /^\d{17,20}$/.test(s);

// -----------------------------------------------------------------------------
// Parancsok betöltése a ./commands mappából
// -----------------------------------------------------------------------------
async function loadCommands() {
  const commands = [];
  const commandsDir = path.join(__dirname, "commands");

  if (!fs.existsSync(commandsDir)) {
    Logger.warn(`[commands_handler] Commands directory not found: ${commandsDir}`);
    return commands;
  }

  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    try {
      const mod = await import(`./commands/${file}`);
      const data =
        mod?.data?.toJSON?.() ??
        mod?.public_data?.toJSON?.() ??
        mod?.public_data?.data?.toJSON?.();
      if (data) {
        commands.push(data);
      } else {
        Logger.warn(`[commands_handler] Command loaded but missing .data: ${file}`);
      }
    } catch (err) {
      Logger.error(`[commands_handler] Failed to load command ${file}: ${err?.message}`);
    }
  }
  return commands;
}

// -----------------------------------------------------------------------------
// Slash parancsok regisztrálása a Discord API-nál (ENV-ből olvasva)
// -----------------------------------------------------------------------------
export async function registerCommands() {
  try {
    if (!isSnowflake(DISCORD_CLIENT_ID)) {
      console.error(
        `[registerCommands] Invalid DISCORD_CLIENT_ID "${DISCORD_CLIENT_ID}". Skipping registration.`
      );
      return;
    }
    if (!DISCORD_TOKEN) {
      console.error("[registerCommands] Missing DISCORD_TOKEN. Skipping registration.");
      return;
    }

    const rest = new DiscordREST({ version: "10" }).setToken(DISCORD_TOKEN);
    const body = await loadCommands();

    Logger.info(`Start refreshing application (/) commands… count=${body.length}`);
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body });
    Logger.info("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Error reloading commands:", error);
  }
}

// -----------------------------------------------------------------------------
// Slash parancsok kezelése – részletes hibaloggal
// -----------------------------------------------------------------------------
export async function handleCommands(interaction) {
  const isSlash =
    typeof interaction.isChatInputCommand === "function"
      ? interaction.isChatInputCommand()
      : interaction.isCommand?.();

  if (!isSlash) return;

  const commandName = interaction.commandName;
  const channel = interaction.channel;
  const inThread =
    typeof channel?.isThread === "function" ? channel.isThread() : channel?.isThread;

  Logger.info(
    `Received command: ${commandName} by ${interaction.user?.id} in channel ${channel?.id} (thread=${!!inThread})`
  );

  // Csatorna-korlát (ha be van állítva)
  if (
    DISCORD_COMMAND_CHANNEL_ID &&
    !inThread &&
    interaction.channelId !== DISCORD_COMMAND_CHANNEL_ID
  ) {
    try {
      await interaction.reply({
        content: `This command is not allowed here. Use <#${DISCORD_COMMAND_CHANNEL_ID}> or a private thread.`,
        ephemeral: true,
      });
    } catch (e) {
      Logger.error("Error replying (wrong channel notice):", e);
    }
    return;
  }

  try {
    const module = await import(`./commands/${commandName}.js`);

    const rawOpts = interaction.options?._hoistedOptions ?? [];
    const opts = Object.fromEntries(rawOpts.map((o) => [o.name, o.value]));
    if (Logger.debug) Logger.debug(`[${commandName}] options: ${JSON.stringify(opts)}`);

    await module.execute(interaction);
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    Logger.error(`[${commandName}] Failed: ${msg}`);

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ Hiba: ${err?.message || "unknown error"}`,
          ephemeral: true,
        });
      } else {
        await interaction.followUp({
          content: `❌ Hiba: ${err?.message || "unknown error"}`,
          ephemeral: true,
        });
      }
    } catch (e) {
      Logger.error(`[${commandName}] Error replying to interaction:`, e);
    }
  }
}
