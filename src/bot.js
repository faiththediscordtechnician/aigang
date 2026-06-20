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

const COMMAND_PREFIX_PROJECT = '!project';
const COMMAND_PREFIX_CONTINUE = '!continue';

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Handle !project command
  if (message.content.startsWith(COMMAND_PREFIX_PROJECT)) {
    const rest = message.content.slice(COMMAND_PREFIX_PROJECT.length).trim();
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
    return;
  }

  // Handle !continue command
  if (message.content.startsWith(COMMAND_PREFIX_CONTINUE)) {
    const projectName = message.content.slice(COMMAND_PREFIX_CONTINUE.length).trim();

    if (!isValidProjectName(projectName)) {
      await message.reply('Usage: `!continue <projectname>`');
      return;
    }

    const thread = message.channel;
    if (!thread.isThread()) {
      await message.reply('This command can only be used in a project thread.');
      return;
    }

    await thread.send(`Continuing project **${projectName}**...`);

    try {
      await runProject({
        name: projectName,
        brief: `Continue work on this project based on feedback in this thread.`,
        postToThread: (text) => thread.send(text),
        thread,
      });
    } catch (err) {
      console.error(err);
      await thread.send(`Project continuation failed: ${err.message}`);
    }
    return;
  }
});

startServer();
client.login(TOKEN);
