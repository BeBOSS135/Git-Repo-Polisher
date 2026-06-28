# Git-Repo-Polisher

Git-Repo-Polisher is a tool designed to automate the generation of project files for existing repositories based on their current state and dependencies. It analyzes your repository, detects the technology stack, and generates essential files such as `.gitignore`, `LICENSE`, CI/CD configurations, and README.md.

## Tech Stack
- JavaScript
- Node.js

## Installation Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/yourusername/Git-Repo-Polisher.git
   cd Git-Repo-Polisher
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run the Application**:
   ```bash
   npm run dev
   ```

## Usage Example

To use Git-Repo-Polisher, simply navigate to your repository on GitHub and run it locally. The tool will prompt you for a GitHub token and the URL of your repository. It will then analyze the repository, detect the technology stack, and generate the necessary files.

## Folder Structure Overview

```
Git-Repo-Polisher/
├── index.html
├── package-lock.json
├── package.json
├── scripts/
│   └── test-core.mjs
├── src/
│   ├── App.jsx
│   ├── lib/
│   │   ├── detectStack.js
│   │   ├── generators.js
│   │   ├── github.js
│   │   ├── ollama.js
│   │   ├── pipeline.js
│   │   ├── pyImports.js
│   │   ├── pypi.js
│   │   └── suggestions.js
│   ├── main.jsx
│   └── styles.css
└── start.bat
```
