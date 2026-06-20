const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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

async function readThreadMessages(thread) {
  if (!thread) return [];
  try {
    const messages = await thread.messages.fetch({ limit: 100 });
    return messages
      .reverse()
      .filter((msg) => !msg.author.bot)
      .map((msg) => `${msg.author.username}: ${msg.content}`)
      .join('\n');
  } catch (err) {
    console.error('Failed to read thread messages:', err);
    return '';
  }
}

async function runAgentTurn(agentDef, cwd, transcript, projectBrief, thread) {
  const userMessages = await readThreadMessages(thread);
  const fullTranscript = userMessages ? `${transcript}\n---USER MESSAGES---\n${userMessages}` : transcript;
  const prompt =
    `Project brief: ${projectBrief}\n\n` +
    `Conversation so far (most recent last):\n${fullTranscript || '(nothing yet)'}\n\n` +
    'Take your turn now. If there are new user messages above (after "---USER MESSAGES---"), read and respond to them.';

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
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
        permissionMode: 'dontAsk',
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

function commitAndPushProject(projectName, projectPath) {
  try {
    const repoRoot = path.join(__dirname, '..');
    const branchName = `project/${projectName}`;
    execSync('git add -A', { cwd: repoRoot });
    execSync(`git commit -m "Project: ${projectName}"`, { cwd: repoRoot });
    execSync(`git push -u origin HEAD:${branchName} --force`, { cwd: repoRoot });
    return `https://github.com/faiththediscordtechnician/aigang/tree/${branchName}/projects/${projectName}`;
  } catch (err) {
    console.error('Failed to commit/push project:', err);
    return null;
  }
}

/**
 * Runs a project's agent team in round-robin turns inside a Discord thread.
 * Agents read user messages from the thread and adjust their work dynamically.
 * When PROJECT COMPLETE is signaled, commits the project to a git branch and posts a link.
 */
async function runProject({ name, brief, postToThread, thread }) {
  const cwd = projectDir(name);
  fs.mkdirSync(cwd, { recursive: true });

  let transcript = '';
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    for (const agentDef of ROSTER) {
      const reply = await runAgentTurn(agentDef, cwd, transcript, brief, thread);
      transcript += `\n${agentDef.name}: ${reply}\n`;
      await postToThread(`**${agentDef.name}:** ${truncate(reply)}`);

      if (reply.includes('PROJECT COMPLETE')) {
        const ghLink = commitAndPushProject(name, cwd);
        if (ghLink) {
          await postToThread(`✅ Project committed to branch \`project/${name}\`\n${ghLink}`);
        }
        return;
      }
    }
  }
  await postToThread('⏱️ Reached max rounds without a PROJECT COMPLETE signal. Stopping.');
}

module.exports = { runProject };
