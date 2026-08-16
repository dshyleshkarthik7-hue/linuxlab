import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const TerminalConstructor = (xtermModule as any).Terminal || (xtermModule as any).default?.Terminal || (xtermModule as any).default || xtermModule;
const FitAddonConstructor = (fitModule as any).FitAddon || (fitModule as any).default?.FitAddon || (fitModule as any).default || fitModule;

export class V86LinuxTerminal {
  private term: any;
  private fitAddon: any;
  private emulator: any = null;
  private containerId: string;
  private isBooted: boolean = false;
  private textDecoder: TextDecoder = new TextDecoder('utf-8');

  constructor(containerId: string = 'v86-terminal-container') {
    this.containerId = containerId;
    this.initTerminal();
  }

  private initTerminal(): void {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    this.term = new TerminalConstructor({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace',
      theme: {
        background: '#04060a',
        foreground: '#38bdf8',
        cursor: '#38bdf8',
        selectionBackground: '#1e3a8a',
      },
      convertEol: true,
      scrollback: 10000,
      rows: 25,
      cols: 80,
    });

    this.fitAddon = new FitAddonConstructor();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);

    setTimeout(() => {
      try {
        this.fitAddon.fit();
      } catch (e) {}
    }, 150);

    this.term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        if (event.type === 'keydown') this.sendSerial('\t');
        return false;
      }
      if (event.ctrlKey && ['c', 'd', 'z', 'l', 'o', 'x', 'w', 'k', 'u'].includes(event.key.toLowerCase())) {
        if (event.type === 'keydown') {
          const charCode = event.key.toLowerCase().charCodeAt(0) - 96;
          this.sendSerial(String.fromCharCode(charCode));
        }
        return false;
      }
      return true;
    });

    this.term.onData((data: string) => {
      this.sendSerial(data);
    });

    container.addEventListener('click', () => {
      this.term.focus();
    });

    window.addEventListener('resize', () => {
      try {
        this.fitAddon.fit();
      } catch (e) {}
    });
  }

  private sendSerial(data: string): void {
    if (!this.emulator) return;
    if (typeof this.emulator.serial0_send === 'function') {
      this.emulator.serial0_send(data);
    }
  }

  public async boot(): Promise<void> {
    if (this.isBooted) return;

    this.term.writeln('\x1b[1;36m====================================================\x1b[0m');
    this.term.writeln('\x1b[1;32m   LinuxLab Engine B — Alpine Linux x86 Hardware VM \x1b[0m');
    this.term.writeln('\x1b[1;36m====================================================\x1b[0m');
    this.term.writeln('Streaming \x1b[33m/alpine.iso\x1b[0m into x86 WASM engine...\r\n');

    try {
      await this.loadScript();

      const V86Starter = (window as any).V86Starter || (window as any).V86;
      if (!V86Starter) {
        throw new Error('v86 runtime was not found at /libv86.js');
      }

      this.emulator = new V86Starter({
        wasm_path: '/v86.wasm',
        memory_size: 512 * 1024 * 1024,
        vga_memory_size: 2 * 1024 * 1024,
        bios: { url: '/seabios.bin' },
        vga_bios: { url: '/vgabios.bin' },
        cdrom: {
          url: '/alpine.iso',
          async: true,
        },
        screen_container: document.getElementById('screen_container'),
        autostart: true,
        disable_speaker: true,
        disable_keyboard: false,
        disable_mouse: true,
      });

      this.emulator.add_listener('serial0-output-byte', (byte: number) => {
        this.term.write(this.textDecoder.decode(new Uint8Array([byte])));
      });

      this.isBooted = true;

      // Auto-trigger default kernel boot in ISOLINUX after load
      setTimeout(() => {
        this.sendSerial('\n');
        this.term.focus();
      }, 1200);

    } catch (err: any) {
      this.term.writeln('\r\n\x1b[1;31m[VM Boot Error]:\x1b[0m ' + (err?.message || err));
    }
  }

  private loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).V86Starter || (window as any).V86) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = '/libv86.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load /libv86.js from public root.'));
      document.head.appendChild(s);
    });
  }

  public restart(): void {
    if (this.emulator && typeof this.emulator.restart === 'function') {
      this.term.clear();
      this.term.writeln('\x1b[33m[Restarting Virtual Machine...]\x1b[0m\r\n');
      this.emulator.restart();
      setTimeout(() => {
        this.sendSerial('\n');
      }, 1200);
    } else {
      this.destroy();
      this.boot();
    }
  }

  public destroy(): void {
    if (this.emulator) {
      try {
        this.emulator.destroy();
      } catch (e) {}
      this.emulator = null;
      this.isBooted = false;
    }
    this.term.clear();
  }
}