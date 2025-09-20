import { REST } from '@discordjs/rest';
import { Routes } from 'discord.js';
// src/bot/commands_handler.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { REST, Routes } from 'discord.js';

import Logger from '../utils/logger.js';
import ConfigurationManager from '../utils/config_manager.js';

// __dirname ESM-ben
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// A repo-ban a config "getterek" property-ként vannak használva
// (NEM függvényhívás), ezért itt is így olvassuk ki.
const discordConfig = ConfigurationManager.getDiscordConfig;
const command_id_channel_id = ConfigurationManager.getDiscordCommandChannelId;

// -----------------------------------------------------------------------------
// Parancsok betöltése (dynamic import) a ./commands mappából
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
      // A legtöbb djs mintában command.data.toJSON() van.
      // Ha a repo-ban public_data néven van, arra is támogatás:
      const data =
        mod?.data?.toJSON?.() ??
        mod?.public_data?.t_

    try {   
        const module = await import(`./commands/${interaction.commandName}.js`);
        await module.execute(interaction);
    } catch (error) {
        Logger.error('Error handling command:', error);

        // prevent crash if interaction is not found
        try {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
        catch (error) {
            Logger.error('Error replying to interaction:', error);
        }
    }
}
