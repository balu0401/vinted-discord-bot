// src/bot/commands_handler.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { REST as DiscordREST, Routes } from 'discord.js';

import Logger from '../utils/logger.js';

// ---- ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- ENV (Render → Environment)
const DISCORD_CLIENT_ID = (process.env.DISCORD_CLIENT_ID || '').trim();
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || '').trim();
const DISCORD_COMMAND_CHANNEL_ID = (process.env.DISCORD_COMMAND_CHANNEL_ID || '').trim();

// Snowflake (17–20 számjegy) ellenőrzés
const isSnowflake = (s) => /^\d{17,20}$/.test(s);

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
      // támogatjuk a data és public_data sémákat is
      const data =
        mod?.data?.toJSON?.() ??
        mod?.public_dat_
