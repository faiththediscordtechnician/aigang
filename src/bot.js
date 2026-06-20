require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const { runProject } = require('./orchestrator');
const { isValidProjectName } = require('./projectPaths');
const { startServer } = require('./server');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error('DISCORD_BOT_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const COMMAND_PREFIX = '!project';

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(COMMAND_PREFIX)) return;

  const rest = message.content.slice(COMMAND_PREFIX.length).trim();
  const separatorIndex = rest.indexOf('|');
  if (separatorIndex === -1) {
    await message.reply('Usage: `!project <name> | <description>`');
    return;
  }

  const name = rest.slice(0, separatorIndex).trim();
  const brief = rest.slice(separatorIndex + 1).trim();

  if (!isValidProjectName(name)) {
    await message.reply('Project name must be alphanumeric (with `-`/`_`), max 64 chars.');
    return;
  }
  if (!brief) {
    await message.reply('Please include a description after `|`.');
    return;
  }

  let thread;
  try {
    thread = await message.startThread({
      name: `project-${name}`,
      type: ChannelType.PublicThread,
    });
  } catch (err) {
    await message.reply(`Could not start a thread here: ${err.message}`);
    return;
  }

  await thread.send(`Starting project **${name}** with brief:\n> ${brief}`);

  try {
    await runProject({
      name,
      brief,
      postToThread: (text) => thread.send(text),
      thread,
    });
  } catch (err) {
    console.error(err);
    await thread.send(`Project run failed: ${err.message}`);
  }
});

startServer();
client.login(TOKEN);
