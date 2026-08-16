import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import * as monaco from 'monaco-editor';

// Vite worker imports for Monaco Editor
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Define the global Monaco environment to resolve workers
(self as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

import { InBrowserLinuxEngine } from './engine/LinuxEngine';
import { AssessmentRunner } from './engine/AssessmentRunner';

const TerminalConstructor = (xtermModule as any).Terminal || (xtermModule as any).default?.Terminal || (xtermModule as any).default || xtermModule;
const FitAddonConstructor = (fitModule as any).FitAddon || (fitModule as any).default?.FitAddon || (fitModule as any).default || fitModule;

class LinuxLabApp {
  private engine: InBrowserLinuxEngine;
  private assessment: AssessmentRunner;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private simTerm: any;
  private simFitAddon: any;

  private currentFile: string = 'main.c';
  private currentInputBuffer: string = '';

  constructor() {
    this.engine = new InBrowserLinuxEngine();
    this.assessment = new AssessmentRunner(this.engine);

    requestAnimationFrame(() => {
      this.initSimulatorTerminal();
      this.initMonaco();
      this.bindEvents();
    });
  }

  private initMonaco(): void {
    const container = document.getElementById('monaco-container');
    if (!container) return;

    const initialCode = this.engine.readFile('/root/main.c') || '';

    this.editor = monaco.editor.create(container, {
      value: initialCode,
      language: 'c',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    });

    this.engine.setEditorHook((filename: string, content: string) => {
      this.switchFileTab(filename, content);
    });

    setTimeout(() => {
      this.editor?.layout();
    }, 200);
  }

  private initSimulatorTerminal(): void {
    const container = document.getElementById('simulator-terminal-container');
    if (!container) return;

    this.simTerm = new TerminalConstructor({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace',
      theme: {
        background: '#020617',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: '#1e3a8a',
      },
      convertEol: true,
      rows: 24,
      cols: 80,
    });

    this.simFitAddon = new FitAddonConstructor();
    this.simTerm.loadAddon(this.simFitAddon);
    this.simTerm.open(container);

    setTimeout(() => {
      try {
        this.simFitAddon.fit();
      } catch (e) {}
    }, 150);

    this.simTerm.writeln('\x1b[1;36m====================================================\x1b[0m');
    this.simTerm.writeln('\x1b[1;32m   LinuxLab Engine A: Interactive Web Shell & POSIX  \x1b[0m');
    this.simTerm.writeln('\x1b[1;36m====================================================\x1b[0m');
    this.simTerm.writeln('Try: \x1b[33mgcc main.c -o table && ./table\x1b[0m | \x1b[33mping google.com\x1b[0m | \x1b[33mtop\x1b[0m\r\n');
    this.simTerm.write(this.engine.getPrompt());

    this.simTerm.onData((data: string) => {
      this.handleInput(data);
    });
  }

  private handleInput(data: string): void {
    if (data === '\r') {
      this.simTerm.writeln('');
      const cmd = this.currentInputBuffer;
      this.currentInputBuffer = '';

      if (cmd.trim().length > 0) {
        this.engine.execute(cmd).then((output) => {
          if (output) {
            this.simTerm.writeln(output);
          }
          this.simTerm.write(this.engine.getPrompt());
        });
      } else {
        this.simTerm.write(this.engine.getPrompt());
      }
      return;
    }

    if (data === '\u007F' || data === '\b') {
      if (this.currentInputBuffer.length > 0) {
        this.currentInputBuffer = this.currentInputBuffer.slice(0, -1);
        this.simTerm.write('\b \b');
      }
      return;
    }

    if (data >= ' ' || data === '\t') {
      this.currentInputBuffer += data;
      this.simTerm.write(data);
    }
  }

  private switchFileTab(filename: string, forcedContent?: string): void {
    this.currentFile = filename;
    const content = forcedContent ?? this.engine.readFile(`/root/${filename}`) ?? '';
    const lang = filename.endsWith('.java') ? 'java' : 'c';

    if (this.editor) {
      const model = this.editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, lang);
      }
      this.editor.setValue(content);
    }

    document.querySelectorAll('.file-tab').forEach((tab) => tab.classList.remove('active'));
    if (filename === 'main.c') document.getElementById('tab-main-c')?.classList.add('active');
    if (filename === 'Main.java') document.getElementById('tab-main-java')?.classList.add('active');
  }

  private saveCurrentEditorToFS(): void {
    if (!this.editor) return;
    const val = this.editor.getValue();
    this.engine.writeFile(`/root/${this.currentFile}`, val);

    const feedback = document.getElementById('test-output-list');
    if (feedback) {
      feedback.innerHTML = `<span style="color: #4ade80;">✓ Saved '/root/${this.currentFile}' to Virtual File System.</span>`;
    }
  }

  private runAutomatedGrading(): void {
    if (!this.editor) return;
    this.saveCurrentEditorToFS();
    const code = this.editor.getValue();
    const feedbackList = document.getElementById('test-output-list');
    if (!feedbackList) return;

    let res;
    if (this.currentFile.endsWith('.java')) {
      res = this.assessment.runJavaTestSuite(code);
    } else {
      res = this.assessment.runCTestSuite(code);
    }

    feedbackList.innerHTML = res.logs.join('');
  }

  private bindEvents(): void {
    document.getElementById('tab-main-c')?.addEventListener('click', () => this.switchFileTab('main.c'));
    document.getElementById('tab-main-java')?.addEventListener('click', () => this.switchFileTab('Main.java'));
    document.getElementById('btn-save-fs')?.addEventListener('click', () => this.saveCurrentEditorToFS());
    document.getElementById('btn-run-tests')?.addEventListener('click', () => this.runAutomatedGrading());

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.engine = new InBrowserLinuxEngine();
      this.assessment = new AssessmentRunner(this.engine);
      this.switchFileTab('main.c');
      this.simTerm.clear();
      this.simTerm.writeln('\x1b[33m[Virtual Environment Reset Complete]\x1b[0m\r\n');
      this.simTerm.write(this.engine.getPrompt());
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveCurrentEditorToFS();
      }
    });

    window.addEventListener('resize', () => {
      this.editor?.layout();
      try {
        this.simFitAddon?.fit();
      } catch (e) {}
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new LinuxLabApp();
});