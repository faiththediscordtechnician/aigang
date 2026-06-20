const fs = require('fs');
const { query } = require('@anthropic-ai/claude-agent-sdk');
const { ROSTER } = require('./agents');
const { projectDir } = require('./projectPaths');

const MAX_ROUNDS = 4;
const DISCORD_MESSAGE_LIMIT = 1900;

function truncate(text) {
  return text.length > DISCORD_MESSAGE_LIMIT
    ? `${text.slice(0, DISCORD_MESSAGE_LIMIT)}\n…(truncated)`
    : text;
}

async function runAgentTurn(agentDef, cwd, transcript, projectBrief) {
  const prompt =
    `Project brief: ${projectBrief}\n\n` +
    `Conversation so far (most recent last):\n${transcript || '(nothing yet)'}\n\n` +
    'Take your turn now.';

  let resultText = '';
  let stderrOutput = '';
  try {
    for await (const message of query({
      prompt,
      options: {
        cwd,
        model: 'claude-haiku-4-5',
        effort: 'low',
        systemPrompt: agentDef.prompt,
        tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
        maxTurns: 15,
        stderr: (data) => {
          stderrOutput += data;
          console.error(`[${agentDef.name} stderr]`, data);
        },
      },
    })) {
      if (message.type === 'result') {
        resultText = message.subtype === 'success' ? message.result : `(error: ${message.subtype})`;
      }
    }
  } catch (err) {
    const detail = stderrOutput.trim() ? `\n${stderrOutput.trim().slice(-1500)}` : '';
    return `(process error: ${err.message})${detail}`;
  }
  return resultText.trim() || '(no response)';
}

/**
 * Runs a project's agent team in round-robin turns inside a Discord thread.
 * `postToThread` is called with each agent's reply so it can be relayed to Discord,
 * which is the coordination channel agents read from on their next turn.
 */
async function runProject({ name, brief, postToThread }) {
  const cwd = projectDir(name);
  fs.mkdirSync(cwd, { recursive: true });

  let transcript = '';
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    for (const agentDef of ROSTER) {
      const reply = await runAgentTurn(agentDef, cwd, transcript, brief);
      transcript += `\n${agentDef.name}: ${reply}\n`;
      await postToThread(`**${agentDef.name}:** ${truncate(reply)}`);

      if (reply.includes('PROJECT COMPLETE')) {
        return;
      }
    }
  }
  await postToThread('⏱️ Reached max rounds without a PROJECT COMPLETE signal. Stopping.');
}

module.exports = { runProject };
