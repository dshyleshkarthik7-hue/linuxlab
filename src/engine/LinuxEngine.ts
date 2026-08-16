export interface VirtualNode {
  name: string;
  type: 'file' | 'dir';
  content?: string;
  permissions?: string;
  children?: Map<string, VirtualNode>;
  parent?: VirtualNode;
}

export class InBrowserLinuxEngine {
  public root: VirtualNode;
  public cwdPath: string[] = ['root'];
  public env: Map<string, string>;
  public history: string[] = [];
  private onEditorOpen?: (filename: string, content: string) => void;

  constructor() {
    this.root = {
      name: '/',
      type: 'dir',
      children: new Map(),
    };

    this.env = new Map([
      ['USER', 'root'],
      ['HOME', '/root'],
      ['SHELL', '/bin/bash'],
      ['PATH', '/bin:/usr/bin'],
      ['TERM', 'xterm-256color'],
    ]);

    this.initializeFileSystem();
  }

  public setEditorHook(fn: (filename: string, content: string) => void): void {
    this.onEditorOpen = fn;
  }

  private initializeFileSystem(): void {
    const defaultDirs = ['root', 'bin', 'etc', 'home', 'var', 'tmp', 'usr', 'dev'];
    for (const dir of defaultDirs) {
      this.root.children!.set(dir, {
        name: dir,
        type: 'dir',
        permissions: 'drwxr-xr-x',
        children: new Map(),
        parent: this.root,
      });
    }

    this.writeFile(
      '/root/main.c',
      `#include <stdio.h>\n\nint main() {\n    int num = 5;\n    printf("Multiplication Table of %d:\\n", num);\n    for (int i = 1; i <= 10; i++) {\n        printf("%d x %d = %d\\n", num, i, num * i);\n    }\n    return 0;\n}\n`
    );

    this.writeFile(
      '/root/Main.java',
      `public class Main {\n    public static void main(String[] args) {\n        int num = 7;\n        boolean isPrime = true;\n        for (int i = 2; i <= num / 2; i++) {\n            if (num % i == 0) {\n                isPrime = false;\n                break;\n            }\n        }\n        if (isPrime) {\n            System.out.println(num + " is a Prime Number");\n        } else {\n            System.out.println(num + " is not a Prime Number");\n        }\n    }\n}\n`
    );

    this.writeFile('/etc/hostname', 'linuxlab-node\n');
    this.writeFile(
      '/etc/os-release',
      'NAME="LinuxLab POSIX Engine"\nVERSION="2.0-Transpiler"\nID=linuxlab\nPRETTY_NAME="LinuxLab Hypervisor v2.0"\n'
    );
  }

  public getPrompt(): string {
    const user = this.env.get('USER') || 'root';
    const path = this.cwdPath.length === 1 && this.cwdPath[0] === 'root' ? '~' : '/' + this.cwdPath.join('/');
    return `\x1b[1;32m${user}@linuxlab\x1b[0m:\x1b[1;34m${path}\x1b[0m# `;
  }

  public getCwd(): string {
    return '/' + this.cwdPath.join('/');
  }

  public resolvePath(target: string): { node: VirtualNode | null; parent: VirtualNode | null; name: string } {
    const isAbs = target.startsWith('/');
    const tokens = target.split('/').filter(Boolean);
    const parts = isAbs ? tokens : [...this.cwdPath, ...tokens];

    const clean: string[] = [];
    for (const p of parts) {
      if (p === '.') continue;
      if (p === '..') clean.pop();
      else clean.push(p);
    }

    if (clean.length === 0) return { node: this.root, parent: null, name: '/' };

    let curr: VirtualNode = this.root;
    let parent: VirtualNode | null = null;

    for (let i = 0; i < clean.length; i++) {
      const part = clean[i];
      if (curr.type !== 'dir' || !curr.children) {
        return { node: null, parent: null, name: part };
      }
      parent = curr;
      const next = curr.children.get(part);
      if (!next) {
        if (i === clean.length - 1) return { node: null, parent: curr, name: part };
        return { node: null, parent: null, name: part };
      }
      curr = next;
    }

    return { node: curr, parent, name: clean[clean.length - 1] };
  }

  public writeFile(pathStr: string, content: string): boolean {
    const { node, parent, name } = this.resolvePath(pathStr);
    if (node && node.type === 'dir') return false;
    if (node && node.type === 'file') {
      node.content = content;
      return true;
    }
    if (parent && parent.children) {
      parent.children.set(name, {
        name,
        type: 'file',
        permissions: '-rw-r--r--',
        content,
        parent,
      });
      return true;
    }
    return false;
  }

  public readFile(pathStr: string): string | null {
    const { node } = this.resolvePath(pathStr);
    if (node && node.type === 'file') return node.content ?? '';
    return null;
  }

  public async execute(raw: string): Promise<string> {
    const line = raw.trim();
    if (!line) return '';
    this.history.push(line);

    if (line.includes('&&')) {
      const subCmds = line.split('&&').map((s) => s.trim());
      let combinedOut = '';
      for (const cmd of subCmds) {
        const out = await this.execute(cmd);
        if (out) combinedOut += (combinedOut ? '\n' : '') + out;
      }
      return combinedOut;
    }

    if (line.includes('|')) {
      const stages = line.split('|').map((s) => s.trim());
      let pipeOut = '';
      for (const st of stages) {
        const cmd = pipeOut ? `${st} ${pipeOut}` : st;
        pipeOut = await this.executeSingle(cmd);
      }
      return pipeOut;
    }

    if (line.includes('>')) {
      const append = line.includes('>>');
      const [cmdPart, targetFile] = line.split(append ? '>>' : '>').map((s) => s.trim());
      const res = await this.executeSingle(cmdPart);
      const prev = append ? this.readFile(targetFile) || '' : '';
      this.writeFile(targetFile, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + res);
      return '';
    }

    return this.executeSingle(line);
  }

  private async executeSingle(cmdLine: string): Promise<string> {
    const tokens = cmdLine.split(/\s+/).filter(Boolean);
    const cmd = tokens[0];
    const args = tokens.slice(1);

    switch (cmd) {
      case 'clear':
        return '\x1b[2J\x1b[H';
      case 'pwd':
        return this.getCwd();
      case 'whoami':
        return this.env.get('USER') || 'root';
      case 'date':
        return new Date().toUTCString();
      case 'echo':
        return args.join(' ').replace(/^["']|["']$/g, '');

      case 'uname':
        return args.includes('-a')
          ? 'Linux linuxlab 6.6.0-wasm-hypervisor #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux'
          : 'Linux';

      case 'ping': {
        const host = args[0] || '8.8.8.8';
        return `PING ${host} (${host}) 56(84) bytes of data.\n64 bytes from ${host}: icmp_seq=1 ttl=118 time=12.4 ms\n64 bytes from ${host}: icmp_seq=2 ttl=118 time=11.8 ms\n64 bytes from ${host}: icmp_seq=3 ttl=118 time=12.1 ms\n--- ${host} ping statistics ---\n3 packets transmitted, 3 received, 0% packet loss, time 2003ms`;
      }

      case 'curl': {
        const target = args[0] || 'https://api.linuxlab.internal';
        return `\x1b[32mHTTP/1.1 200 OK\x1b[0m\nContent-Type: application/json\n\n{"status":"connected","engine":"Engine A (Simulator)","target":"${target}"}`;
      }

      case 'traceroute': {
        const host = args[0] || 'google.com';
        return `traceroute to ${host} (142.250.190.46), 30 hops max, 60 byte packets\n 1  _gateway (192.168.1.1)  0.312 ms  0.289 ms  0.267 ms\n 2  10.0.0.1 (10.0.0.1)  4.120 ms  4.090 ms  4.050 ms\n 3  ${host} (142.250.190.46)  11.450 ms  11.410 ms  11.380 ms`;
      }

      case 'ifconfig':
      case 'ip':
        return `eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.122.45  netmask 255.255.255.0  broadcast 192.168.122.255\n        inet6 fe80::5054:ff:fe12:3456  prefixlen 64  scopeid 0x20<link>\n        ether 52:54:00:12:34:56  txqueuelen 1000  (Ethernet)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n        loop  txqueuelen 1000  (Local Loopback)`;

      case 'htop':
      case 'top':
        return '\x1b[1;36mTasks: 3 total, 1 running, 2 sleeping\n%Cpu(s):  1.2 us,  0.4 sy,  0.0 ni, 98.4 id\nMiB Mem :   256.0 total,   198.4 free,    32.6 used\n\n  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n    1 root      20   0    4120   1240   1100 S   0.0   0.5   0:01.02 init\n   45 root      20   0    6580   2410   1980 S   0.0   0.9   0:00.15 bash\x1b[0m';

      case 'ps':
        return '  PID TTY          TIME CMD\n    1 ?        00:00:01 init\n   45 pts/0    00:00:00 bash\n  102 pts/0    00:00:00 ps';

      case 'free':
        return '               total        used        free      shared  buff/cache   available\nMem:          256000       58240      197760           0       12000      185760\nSwap:              0           0           0';

      case 'df':
        return 'Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/root        8256000   1420000   6416000  18% /\ntmpfs             128000         0    128000   0% /dev/shm';

      case 'ls': {
        const target = args.find((a) => !a.startsWith('-')) || '.';
        const { node } = this.resolvePath(target);
        if (!node) return `ls: cannot access '${target}': No such file or directory`;
        if (node.type === 'file') return node.name;
        if (!node.children || node.children.size === 0) return '';
        const list: string[] = [];
        node.children.forEach((child) => {
          list.push(child.type === 'dir' ? `\x1b[1;34m${child.name}\x1b[0m` : child.name);
        });
        return list.join('  ');
      }

      case 'cd': {
        const dest = args[0] || '/root';
        if (dest === '~') {
          this.cwdPath = ['root'];
          return '';
        }
        const { node } = this.resolvePath(dest);
        if (!node) return `bash: cd: ${dest}: No such file or directory`;
        if (node.type !== 'dir') return `bash: cd: ${dest}: Not a directory`;

        const isAbs = dest.startsWith('/');
        const parts = isAbs ? dest.split('/').filter(Boolean) : [...this.cwdPath, ...dest.split('/').filter(Boolean)];
        const clean: string[] = [];
        for (const p of parts) {
          if (p === '..') clean.pop();
          else if (p !== '.') clean.push(p);
        }
        this.cwdPath = clean;
        return '';
      }

      case 'mkdir': {
        if (!args[0]) return 'mkdir: missing operand';
        const { node, parent, name } = this.resolvePath(args[0]);
        if (node) return `mkdir: cannot create directory '${args[0]}': File exists`;
        if (parent && parent.children) {
          parent.children.set(name, { name, type: 'dir', children: new Map(), parent });
          return '';
        }
        return `mkdir: cannot create directory '${args[0]}': No such file or directory`;
      }

      case 'touch': {
        if (!args[0]) return 'touch: missing file operand';
        this.writeFile(args[0], '');
        return '';
      }

      case 'rm': {
        if (!args[0]) return 'rm: missing operand';
        const target = args.find((a) => !a.startsWith('-')) || args[0];
        const { node, parent, name } = this.resolvePath(target);
        if (!node || !parent || !parent.children) return `rm: cannot remove '${target}': No such file or directory`;
        parent.children.delete(name);
        return '';
      }

      case 'cat': {
        if (!args[0]) return 'cat: missing operand';
        const data = this.readFile(args[0]);
        if (data === null) return `cat: ${args[0]}: No such file or directory`;
        return data;
      }

      case 'grep': {
        if (args.length < 2) return 'grep: usage: grep PATTERN FILE';
        const [pat, file] = args;
        const data = this.readFile(file);
        if (data === null) return `grep: ${file}: No such file or directory`;
        return data.split('\n').filter((l) => l.includes(pat)).join('\n');
      }

      case 'nano':
      case 'vi':
      case 'vim': {
        const file = args[0] || 'main.c';
        let current = this.readFile(file);
        if (current === null) {
          this.writeFile(file, '');
          current = '';
        }
        if (this.onEditorOpen) {
          this.onEditorOpen(file, current);
        }
        return `\x1b[33m[Opened '${file}' in Code Editor]\x1b[0m`;
      }

      case 'gcc':
      case 'clang': {
        if (!args[0]) return `${cmd}: fatal error: no input files\ncompilation terminated.`;
        const src = this.readFile(args[0]);
        if (src === null) return `${cmd}: error: ${args[0]}: No such file or directory`;

        let bin = 'a.out';
        const outIdx = args.indexOf('-o');
        if (outIdx !== -1 && args[outIdx + 1]) bin = args[outIdx + 1];

        this.writeFile(bin, `__TRANSPILED_C__:${args[0]}`);
        return '';
      }

      case './a.out':
      case './table':
      case './' + cmd.replace(/^\.\//, ''): {
        const binName = cmd.replace(/^\.\//, '');
        const bin = this.readFile(binName);
        if (!bin) return `bash: ${cmd}: No such file or directory`;

        if (bin.startsWith('__TRANSPILED_C__:')) {
          const srcFile = bin.split(':')[1];
          const src = this.readFile(srcFile) || '';
          return this.executeGeneralCode(src, 'c');
        }
        return `bash: ${cmd}: cannot execute binary file`;
      }

      case 'javac': {
        if (!args[0]) return 'javac: no source files specified';
        const src = this.readFile(args[0]);
        if (src === null) return `javac: file not found: ${args[0]}`;

        const classMatch = src.match(/public\s+class\s+([A-Za-z0-9_]+)/) || src.match(/class\s+([A-Za-z0-9_]+)/);
        const className = classMatch ? classMatch[1] : args[0].replace('.java', '');

        this.writeFile(`${className}.class`, `__TRANSPILED_JAVA__:${args[0]}`);
        return '';
      }

      case 'java': {
        if (!args[0]) return 'Usage: java [options] <mainclass> [args...]';
        const className = args[0].replace('.class', '');
        const classHeader = this.readFile(`${className}.class`);

        let srcCode = '';
        if (classHeader && classHeader.startsWith('__TRANSPILED_JAVA__:')) {
          const srcFile = classHeader.split(':')[1];
          srcCode = this.readFile(srcFile) || '';
        } else {
          const fallback = this.readFile(args[0].endsWith('.java') ? args[0] : `${args[0]}.java`);
          if (fallback) srcCode = fallback;
        }

        if (!srcCode) return `Error: Could not find or load main class ${args[0]}`;
        return this.executeGeneralCode(srcCode, 'java');
      }

      default:
        return `bash: ${cmd}: command not found`;
    }
  }

  public executeGeneralCode(code: string, language: 'c' | 'java', injectedVars?: Record<string, number>): string {
    const outputs: string[] = [];

    try {
      let runnable = code;
      runnable = runnable.replace(/#include\s*<[^>]+>/g, '').replace(/#include\s*"[^"]+"/g, '');
      runnable = runnable.replace(/import\s+[^;]+;/g, '').replace(/package\s+[^;]+;/g, '');

      if (language === 'java') {
        const classHeader = /(?:public\s+)?class\s+\w+\s*\{/.exec(runnable);
        if (classHeader) {
          runnable = runnable.replace(/(?:public\s+)?class\s+\w+\s*\{/, '');
          const lastBraceIdx = runnable.lastIndexOf('}');
          if (lastBraceIdx !== -1) {
            runnable = runnable.substring(0, lastBraceIdx) + runnable.substring(lastBraceIdx + 1);
          }
        }
      }

      runnable = runnable.replace(/(?:public\s+)?(?:static\s+)?(?:void|int)\s+main\s*\([^)]*\)\s*\{/, 'function main() {');
      runnable = runnable.replace(/System\.out\.println\s*\(([\s\S]*?)\);/g, (_m, expr) => `__out.push(String(${expr ? expr.trim() : '""'}) + "\\n");`);
      runnable = runnable.replace(/System\.out\.print\s*\(([\s\S]*?)\);/g, (_m, expr) => `__out.push(String(${expr ? expr.trim() : '""'}));`);
      runnable = runnable.replace(/printf\s*\(\s*"([^"]*)"(?:\s*,\s*([\s\S]*?))?\s*\);/g, (_m, fmt, args) => {
        if (!args) return `__out.push(${JSON.stringify(fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t'))});`;
        return `__out.push(__formatPrintf(${JSON.stringify(fmt)}, ${args.trim()}));`;
      });

      runnable = runnable.replace(/\b(?:int|long|short|float|double|boolean|bool|char|String)\s+([a-zA-Z_]\w*)/g, 'let $1');
      runnable = runnable.replace(/return\s+0\s*;/g, 'return;');

      let injectPrefix = '';
      if (injectedVars) {
        for (const [k, v] of Object.entries(injectedVars)) {
          injectPrefix += `let ${k} = ${v};\n`;
          runnable = runnable.replace(new RegExp(`let\\s+${k}\\s*=[^;]+;`, 'g'), '');
        }
      }

      const runner = new Function(
        '__out',
        '__formatPrintf',
        `
        ${injectPrefix}
        ${runnable}
        if (typeof main === 'function') {
          main();
        }
        `
      );

      const formatPrintf = (fmt: string, ...args: any[]) => {
        let text = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        let idx = 0;
        return text.replace(/%[dfsSc]/g, () => (idx < args.length ? String(args[idx++]) : ''));
      };

      runner(outputs, formatPrintf);
      return outputs.length > 0 ? outputs.join('') : 'Program exited with code 0.';
    } catch (err: any) {
      return `\x1b[31m[Transpiler Error]:\x1b[0m ${err.message || err}`;
    }
  }
}