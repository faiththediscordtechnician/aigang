const path = require('path');

const PROJECTS_ROOT = path.join(__dirname, '..', 'projects');

const SAFE_NAME_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/i;

function isValidProjectName(name) {
  return SAFE_NAME_RE.test(name);
}

function projectDir(name) {
  if (!isValidProjectName(name)) {
    throw new Error(`Invalid project name: ${name}`);
  }
  return path.join(PROJECTS_ROOT, name);
}

module.exports = { PROJECTS_ROOT, isValidProjectName, projectDir };
