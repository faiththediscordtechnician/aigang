const express = require('express');
const path = require('path');
const fs = require('fs');
const { projectDir, isValidProjectName, PROJECTS_ROOT } = require('./projectPaths');

const app = express();

// Root endpoint: list all projects
app.get('/', (req, res) => {
  fs.readdir(PROJECTS_ROOT, (err, files) => {
    if (err) {
      return res.status(500).send('Could not list projects.');
    }
    const projects = files.filter((f) => isValidProjectName(f));
    const links = projects.map((p) => `<li><a href="/${p}/">${p}</a></li>`).join('\n');
    res.send(`
      <html>
        <body>
          <h1>aigang Projects</h1>
          <ul>${links || '<li>No projects yet.</li>'}</ul>
        </body>
      </html>
    `);
  });
});

// Path routing: /projectname/* serves from projects/projectname/*
app.get(/^\/([^\/]+)\/(.*)$/, (req, res) => {
  const projectName = req.params[0];
  const filePath = req.params[1] || '';

  if (!isValidProjectName(projectName)) {
    return res.status(400).send('Invalid project name.');
  }

  const projectPath = projectDir(projectName);

  // Check if project exists
  if (!fs.existsSync(projectPath)) {
    return res.status(404).send(`Project "${projectName}" not found.`);
  }

  // Build the requested file path within the project
  let requestedFile = path.join(projectPath, filePath || '');

  // If requesting a directory or root, try index.html
  if (fs.existsSync(requestedFile)) {
    const stat = fs.statSync(requestedFile);
    if (stat.isDirectory()) {
      requestedFile = path.join(requestedFile, 'index.html');
    }
  }

  // Security: ensure the resolved path is within the project directory
  const resolved = path.resolve(requestedFile);
  if (!resolved.startsWith(path.resolve(projectPath))) {
    return res.status(403).send('Access denied.');
  }

  if (fs.existsSync(resolved)) {
    res.sendFile(resolved);
  } else {
    res.status(404).send(`File not found: ${filePath}`);
  }
});

// Match /projectname without trailing content
app.get(/^\/([^\/]+)\/?$/, (req, res) => {
  const projectName = req.params[0];

  if (!isValidProjectName(projectName)) {
    return res.status(400).send('Invalid project name.');
  }

  const projectPath = projectDir(projectName);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).send(`Project "${projectName}" not found.`);
  }

  const indexPath = path.join(projectPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(path.resolve(indexPath));
  } else {
    fs.readdir(projectPath, (err, files) => {
      if (err) {
        return res.status(500).send('Could not read project.');
      }
      const links = files
        .filter((f) => !f.startsWith('.'))
        .map((f) => `<li><a href="/${projectName}/${f}">${f}</a></li>`)
        .join('\n');
      res.send(`
        <html>
          <body>
            <h1>${projectName}</h1>
            <ul>${links || '<li>Empty project</li>'}</ul>
            <hr/>
            <a href="/">Back to projects</a>
          </body>
        </html>
      `);
    });
  }
});

const PORT = process.env.PORT || 3000;

function startServer() {
  app.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
  });
}

module.exports = { startServer };
