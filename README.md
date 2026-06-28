# Git-Repo-Polisher

Git-Repo-Polisher is a tool designed to automate the generation of project files for existing repositories based on their current state and dependencies. It analyzes your repository, detects the technology stack, and generates essential files such as `.gitignore`, `LICENSE`, CI/CD configurations, and README.md.

## Tech Stack

- **JavaScript**: For the frontend React application.
- **Node.js**: For the backend logic.
- **Python**: For additional processing and data analysis (if applicable).
- **GitHub API**: To interact with GitHub repositories.

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
   npm start
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

## Environment

- **Python**: Python 3.8 or higher.
- **Key Libraries**: `requests`, `markdown`.
- **Conda Alternative**:
  ```bash
  conda create -n git-repo-polisher python=3.8
  conda activate git-repo-polisher
  conda install requests markdown
  ```

## Hardware

Minimum: A CPU with at least 2GB of RAM; runs on GPU for faster processing.

## Dataset

This tool does not consume any specific dataset as it is designed to work with existing repositories.
