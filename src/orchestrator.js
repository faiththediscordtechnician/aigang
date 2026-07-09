async function getProjectFiles(projectPath) {
  try {
    const files = [];
    const walk = (dir, prefix = '') => {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        const relPath = prefix ? `${prefix}/${entry}` : entry;
        if (stat.isFile()) {
          files.push(relPath);
        } else if (stat.isDirectory()) {
          walk(fullPath, relPath);
        }
      }
    };
    walk(projectPath);
    return files;
  } catch (err) {
    console.error('Error getting project files:', err);
    return [];
  }
}

function formatFileLinks(projectName, files) {
  if (files.length === 0) return '';
  const links = files
    .slice(0, 10) // Limit to first 10 files
    .map((f) => `[${f}](https://aigang-production.up.railway.app/${projectName}/${f})`)
    .join(' • ');
  return `\n📁 Files: ${links}${files.length > 10 ? ` (+${files.length - 10} more)` : ''}`;
}

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

    // Ensure git is configured
    try {
      execSync('git config user.email', { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      execSync('git config user.email "aigang-bot@railway.local"', { cwd: repoRoot });
      execSync('git config user.name "aigang bot"', { cwd: repoRoot });
    }

    execSync('git add -A', { cwd: repoRoot });
    execSync(`git commit -m "Project: ${projectName}"`, { cwd: repoRoot });
    execSync(`git push origin main`, { cwd: repoRoot });
    console.log(`Successfully committed and pushed project ${projectName}`);
    return `https://aigang-production.up.railway.app/${projectName}`;
  } catch (err) {
    console.error(`Failed to commit/push project ${projectName}:`, err.message);
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

      if (reply.toUpperCase().includes('PROJECT COMPLETE') || reply.toUpperCase().includes('READY TO DEPLOY')) {
        const files = await getProjectFiles(cwd);
        const deployUrl = commitAndPushProject(name, cwd);
        const fileLinks = formatFileLinks(name, files);
        if (deployUrl) {
          await postToThread(`✅ Project deployed to Railway!\n${deployUrl}${fileLinks}`);
        }
        return;
      }
    }
  }
  await postToThread('⏱️ Reached max rounds without a PROJECT COMPLETE signal. Stopping.');
}

module.exports = { runProject };
