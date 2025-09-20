// src/bot/commands_handler.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { REST as DiscordREST, Routes } from 'discord.js';

import Logger from '../utils/logger.js';
import ConfigurationManager from '../utils/config_manager.js';

// __dirname ESM-ben
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// A config getterek property-k, nem függvényhívások
const discordConfig = ConfigurationManager.getDiscordConfig;
const command_id_channel_id = ConfigurationManager.getDiscordCommandChannelId;

// -----------------------------------------------------------------------------
// Parancsok betöltése a ./commands mappából (dynamic import)
// -----------------------------------------------------------------------------
async function loadCommands() {
  const commands = [];
  const commandsDir = path.join(__dirname, 'commands');

  if (!fs.existsSync(commandsDir)) {
    Logger.warn(`[commands_handler] Commands directory not found: ${commandsDir}`);
    return commands;
  }

  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'));

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
        Logger.warn(`[commands_handler] Command file loaded but no .data: ${file}`);
      }
    } catch (err) {
      Logger.error(`[commands_handler] Failed to load command: ${file} → ${err?.message}`);
    }
  }

  return commands;
}

// -----------------------------------------------------------------------------
// Parancsok regisztrálása a Discord API-nál
// -----------------------------------------------------------------------------
export async function registerCommands(client, discordClientId) {
  const clientId = discordClientId || discordConfig.client_id;
  const rest = new DiscordREST({ version: '10' }).setToken(discordConfig.token);

  try {
    const commands = await loadCommands();

    Logger.info(`Start refreshing application (/) commands… count=${commands.length}`);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    Logger.info('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error reloading commands:', error);
  }
}

// -----------------------------------------------------------------------------
// Slash parancsok kezelése – részletes hibaloggal
// -----------------------------------------------------------------------------
export async function handleCommands(interaction) {
  const isSlash =
    typeof interaction.isChatInputCommand === 'function'
      ? interaction.isChatInputCommand()
      : interaction.isCommand?.();

  if (!isSlash) return;

  const commandName = interaction.commandName;
  const channel = interaction.channel;
  const inThread =
    typeof channel?.isThread === 'function' ? channel.isThread() : channel?.isThread;

  Logger.info(
    `Received command: ${commandName} by ${interaction.user?.id} in channel ${channel?.id} (thread=${!!inThread})`
  );

  // Csak a megengedett command csatornában vagy threadben fusson
  if (interaction.channelId !== command_id_channel_id && !inThread) {
    try {
      await interaction.reply({
        content: `This command is not allowed in this channel. Please use <#${command_id_channel_id}> or one of your private channels.`,
        ephemeral: true,
      });
    } catch (e) {
      Logger.error('Error replying (wrong channel notice):', e);
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
          content: `❌ Hiba: ${err?.message || 'unknown error'}`,
          ephemeral: true,
        });
      } else {
        await interaction.followUp({
          content: `❌ Hiba: ${err?.message || 'unknown error'}`,
          ephemeral: true,
        });
      }
    } catch (e) {
      Logger.error(`[${commandName}] Error replying to interaction:`, e);
    }
  }
}
