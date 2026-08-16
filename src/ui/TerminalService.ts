import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export class TerminalService {
  private term: Terminal;
  private fitAddon: FitAddon;
  private outputBuffer: string = '';
  private commandHistory: string[] = [];
  private historyIndex: number = -1;

  constructor(containerId: string, onInput: (data: string) => void) {
    this.term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#aeafad',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
      },
      allowProposedApi: true,
      scrollback: 2000,
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(new WebLinksAddon());

    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Terminal container #${containerId} not found`);
    this.term.open(container);

    // Fit after a short delay so layout is ready
    requestAnimationFrame(() => {
      this.fitAddon.fit();
    });

    window.addEventListener('resize', () => {
      requestAnimationFrame(() => this.fitAddon.fit());
    });

    // Handle input (including history)
    this.term.onData((data) => {
      // Simple history navigation (up/down arrows)
      if (data === '\x1b[A') { // Up
        if (this.commandHistory.length > 0) {
          this.historyIndex = Math.min(this.historyIndex + 1, this.commandHistory.length - 1);
          // We let the engine handle actual line editing for simplicity
        }
        onInput(data);
        return;
      }
      if (data === '\x1b[B') { // Down
        this.historyIndex = Math.max(this.historyIndex - 1, -1);
        onInput(data);
        return;
      }
      onInput(data);
    });
  }

  write(data: string) {
    this.term.write(data);
    this.outputBuffer += data;
  }

  writeln(data: string) {
    this.write(data + '\r\n');
  }

  getBuffer(): string {
    return this.outputBuffer;
  }

  clearBuffer() {
    this.outputBuffer = '';
  }

  focus() {
    this.term.focus();
  }

  addToHistory(cmd: string) {
    if (cmd.trim()) {
      this.commandHistory.unshift(cmd.trim());
      if (this.commandHistory.length > 50) this.commandHistory.pop();
    }
    this.historyIndex = -1;
  }

  getHistory(): string[] {
    return [...this.commandHistory];
  }
}