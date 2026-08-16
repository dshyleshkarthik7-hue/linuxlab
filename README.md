# 🐧 LinuxLab — Interactive OS & Systems Learning Platform

**LinuxLab** is a modern, browser-based interactive learning environment for Linux shell scripting and Operating Systems concepts.

It combines:
- A real Monaco code editor
- An educational Linux terminal (xterm.js)
- Hands-on lab exercises with automatic evaluation
- Contextual hints
- Progress persistence

---

## Features

- **Two course packs** out of the box:
  - Linux Administration & Shell Scripting
  - Operating Systems Concepts (fork, pipe, etc.)
- Realistic educational shell (directories, variables, redirection, scripts)
- Automatic lab evaluation with scoring
- Contextual assistant that gives hints when you're stuck
- Code auto-saved in the browser (IndexedDB)
- Clean dark UI inspired by VS Code / modern IDEs
- PWA-ready (manifest + service worker present)

---

## Quick Start

### Requirements
- **Node.js 18+** (recommended: 20 or 22)
- Modern browser (Chrome, Edge, Firefox, Safari)

### Install & Run

```bash
# Clone or download the project
cd linuxlab

# Install dependencies
npm install

# Start development server
npm run dev
```

Then open **http://localhost:3000**

### Build for production

```bash
npm run build
npm run preview
```

---

## Project Structure

```
linuxlab/
├── public/                 # Static assets + v86 files (for future real emulator mode)
├── src/
│   ├── core/               # EventBus, StorageService
│   ├── engine/             # LinuxEngine (educational shell simulator)
│   ├── plugins/            # Course packs & lab definitions
│   ├── ui/                 # EditorService + TerminalService
│   ├── main.ts             # Application entry point
│   └── style.css
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## How to Add New Labs

Edit the files inside `src/plugins/packs/`.

Example:

```ts
{
  id: 'my-lab',
  title: 'Lab X: Something Cool',
  description: 'Clear description of what the student should do.',
  targetFile: 'myscript.sh',
  language: 'shell',
  initialCode: `#!/bin/bash\necho "Hello"`,
  expectedStdout: /Hello/,
  hints: ['Tip 1', 'Tip 2']
}
```

---

## Future Ideas (Roadmap)

- [ ] Real V86 Linux mode (the assets are already in `/public`)
- [ ] More advanced bash (while loops, functions, pipes)
- [ ] Multi-file projects per lab
- [ ] Teacher dashboard / export results
- [ ] Dark/Light theme toggle
- [ ] Keyboard shortcuts (Ctrl+Enter to Run, etc.)

---

## License

MIT — feel free to use for teaching, personal learning, or commercial products.

Built with ❤️ for students learning Linux and Operating Systems.
