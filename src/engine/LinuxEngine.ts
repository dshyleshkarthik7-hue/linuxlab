import { parseShell, type ShellCommand, type ShellNode } from './ShellParser';

export interface VirtualNode {
  name: string;
  type: 'file' | 'dir';
  content?: string;
  permissions?: string;
  children?: Map<string, VirtualNode>;
  parent?: VirtualNode;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

type CommandContext = { stdin: string };

export class InBrowserLinuxEngine {
  public root: VirtualNode;
  public cwdPath: string[] = ['root'];
  public env: Map<string, string>;
  public history: string[] = [];
  private onEditorOpen?: (filename: string, content: string) => void;

  constructor() {
    this.root = { name: '/', type: 'dir', children: new Map() };
    this.env = new Map([
      ['USER', 'root'], ['HOME', '/root'], ['SHELL', '/bin/bash'],
      ['PATH', '/bin:/usr/bin'], ['TERM', 'xterm-256color']
    ]);
    this.initializeFileSystem();
  }

  public setEditorHook(fn: (filename: string, content: string) => void): void { this.onEditorOpen = fn; }

  private initializeFileSystem(): void {
    for (const dir of ['root', 'bin', 'etc', 'home', 'var', 'tmp', 'usr', 'dev']) {
      this.root.children!.set(dir, { name: dir, type: 'dir', permissions: 'drwxr-xr-x', children: new Map(), parent: this.root });
    }
    this.writeFile('/etc/hostname', 'linuxlab-node\n');
    this.writeFile('/etc/os-release', 'NAME="LinuxLab POSIX Engine"\nVERSION="2.0-Transpiler"\nID=linuxlab\n');
    this.writeFile('/root/main.c', '#include <stdio.h>\nint main() { int num = 5; for (int i = 1; i <= 10; i++) printf("%d x %d = %d\\n", num, i, num * i); return 0; }\n');
    this.writeFile('/root/Main.java', 'public class Main { public static void main(String[] args) { int num = 7; boolean isPrime = true; for (int i = 2; i <= num / 2; i++) if (num % i == 0) { isPrime = false; break; } if (isPrime) System.out.println(num + " is a Prime Number"); else System.out.println(num + " is not a Prime Number"); } }\n');
  }

  public getPrompt(): string {
    const user = this.env.get('USER') || 'root';
    const path = this.cwdPath.length === 1 && this.cwdPath[0] === 'root' ? '~' : '/' + this.cwdPath.join('/');
    return `\x1b[1;32m${user}@linuxlab\x1b[0m:\x1b[1;34m${path}\x1b[0m# `;
  }
  public getCwd(): string { return '/' + this.cwdPath.join('/'); }

  public resolvePath(target: string): { node: VirtualNode | null; parent: VirtualNode | null; name: string } {
    const isAbs = target.startsWith('/');
    const tokens = target.split('/').filter(Boolean);
    const parts = isAbs ? tokens : [...this.cwdPath, ...tokens];
    const clean: string[] = [];
    for (const part of parts) {
      if (part === '.' || part === '') continue;
      if (part === '..') { if (clean.length) clean.pop(); }
      else clean.push(part);
    }
    if (!clean.length) return { node: this.root, parent: null, name: '/' };
    let curr = this.root;
    let parent: VirtualNode | null = null;
    for (let i = 0; i < clean.length; i++) {
      if (curr.type !== 'dir' || !curr.children) return { node: null, parent: null, name: clean[i] };
      parent = curr;
      const next = curr.children.get(clean[i]);
      if (!next) return i === clean.length - 1 ? { node: null, parent: curr, name: clean[i] } : { node: null, parent: null, name: clean[i] };
      curr = next;
    }
    return { node: curr, parent, name: clean[clean.length - 1] };
  }

  public writeFile(pathStr: string, content: string): boolean {
    const { node, parent, name } = this.resolvePath(pathStr);
    if (node?.type === 'dir') return false;
    if (node?.type === 'file') { node.content = content; return true; }
    if (!parent?.children) return false;
    parent.children.set(name, { name, type: 'file', permissions: '-rw-r--r--', content, parent });
    return true;
  }
  public readFile(pathStr: string): string | null { const { node } = this.resolvePath(pathStr); return node?.type === 'file' ? node.content ?? '' : null; }

  public async execute(raw: string): Promise<string> {
    const result = await this.executeResult(raw);
    return result.stdout + (result.stderr ? (result.stdout ? '\n' : '') + result.stderr : '');
  }

  public async executeResult(raw: string): Promise<CommandResult> {
    const line = raw.trim();
    if (!line) return { stdout: '', stderr: '', exitCode: 0, durationMs: 0 };
    this.history.push(line);
    const started = performance.now();
    try {
      const ast = parseShell(line);
      const result = await this.evaluate(ast);
      return { ...result, durationMs: performance.now() - started };
    } catch (error) {
      return { stdout: '', stderr: String(error instanceof Error ? error.message : error), exitCode: 2, durationMs: performance.now() - started };
    }
  }

  private async evaluate(node: ShellNode): Promise<Omit<CommandResult, 'durationMs'>> {
    if (node.type === 'pipeline') return this.runPipeline(node.pipeline!.commands);
    const left = await this.evaluate(node.left!);
    if (node.type === 'and') return left.exitCode === 0 ? this.evaluate(node.right!) : left;
    if (node.type === 'or') return left.exitCode !== 0 ? this.evaluate(node.right!) : left;
    const right = await this.evaluate(node.right!);
    return { stdout: [left.stdout, right.stdout].filter(Boolean).join('\n'), stderr: [left.stderr, right.stderr].filter(Boolean).join('\n'), exitCode: right.exitCode };
  }

  private async runPipeline(commands: ShellCommand[]): Promise<Omit<CommandResult, 'durationMs'>> {
    let input = '';
    let final: Omit<CommandResult, 'durationMs'> = { stdout: '', stderr: '', exitCode: 0 };
    for (const command of commands) {
      const result = await this.runCommand(command, { stdin: input });
      final = result;
      input = result.stdout;
      if (command.stdout) {
        const existing = command.stdout.append ? this.readFile(command.stdout.path) ?? '' : '';
        this.writeFile(command.stdout.path, existing + result.stdout);
        final = { ...final, stdout: '' };
      }
      if (command.stderr) {
        const existing = command.stderr.append ? this.readFile(command.stderr.path) ?? '' : '';
        this.writeFile(command.stderr.path, existing + result.stderr);
        final = { ...final, stderr: '' };
      }
    }
    return final;
  }

  private async runCommand(command: ShellCommand, context: CommandContext): Promise<Omit<CommandResult, 'durationMs'>> {
    const [cmd, ...args] = command.argv;
    if (!cmd) return { stdout: '', stderr: '', exitCode: 0 };
    let stdin = context.stdin;
    if (command.stdin) {
      const data = this.readFile(command.stdin);
      if (data === null) return { stdout: '', stderr: `bash: ${command.stdin}: No such file or directory`, exitCode: 1 };
      stdin = data;
    }
    return this.executeSingle(cmd, args, stdin);
  }

  private ok(stdout = '') { return { stdout, stderr: '', exitCode: 0 }; }
  private fail(stderr: string, exitCode = 1) { return { stdout: '', stderr, exitCode }; }

  private executeSingle(cmd: string, args: string[], stdin: string): Omit<CommandResult, 'durationMs'> {
    switch (cmd) {
      case 'true': return this.ok();
      case 'false': return this.fail('', 1);
      case 'clear': return this.ok('\x1b[2J\x1b[H');
      case 'pwd': return this.ok(this.getCwd());
      case 'whoami': return this.ok(this.env.get('USER') || 'root');
      case 'date': return this.ok(new Date().toUTCString());
      case 'echo': return this.ok(args.join(' '));
      case 'uname': return this.ok(args.includes('-a') ? 'Linux linuxlab 6.6.0-wasm-hypervisor x86_64 GNU/Linux' : 'Linux');
      case 'ls': {
        const target = args.find(a => !a.startsWith('-')) || '.';
        const { node } = this.resolvePath(target);
        if (!node) return this.fail(`ls: cannot access '${target}': No such file or directory`);
        if (node.type === 'file') return this.ok(node.name);
        return this.ok(Array.from(node.children?.values() ?? []).map(child => child.type === 'dir' ? `\x1b[1;34m${child.name}\x1b[0m` : child.name).join('  '));
      }
      case 'cd': {
        const dest = args[0] || '/root';
        const { node } = this.resolvePath(dest === '~' ? '/root' : dest);
        if (!node) return this.fail(`bash: cd: ${dest}: No such file or directory`);
        if (node.type !== 'dir') return this.fail(`bash: cd: ${dest}: Not a directory`);
        const base = dest === '~' ? '/root' : dest;
        const absolute = base.startsWith('/') ? base : this.getCwd() + '/' + base;
        this.cwdPath = absolute.split('/').filter(Boolean);
        return this.ok();
      }
      case 'mkdir': {
        const target = args.find(a => !a.startsWith('-'));
        if (!target) return this.fail('mkdir: missing operand');
        const { node, parent, name } = this.resolvePath(target);
        if (node) return this.fail(`mkdir: cannot create directory '${target}': File exists`);
        if (!parent?.children) return this.fail(`mkdir: cannot create directory '${target}': No such file or directory`);
        parent.children.set(name, { name, type: 'dir', permissions: 'drwxr-xr-x', children: new Map(), parent });
        return this.ok();
      }
      case 'touch': {
        const target = args.find(a => !a.startsWith('-'));
        if (!target) return this.fail('touch: missing file operand');
        if (!this.writeFile(target, this.readFile(target) ?? '')) return this.fail(`touch: cannot touch '${target}'`);
        return this.ok();
      }
      case 'rm': {
        const target = args.find(a => !a.startsWith('-'));
        if (!target) return this.fail('rm: missing operand');
        const { node, parent, name } = this.resolvePath(target);
        if (!node || !parent?.children) return this.fail(`rm: cannot remove '${target}': No such file or directory`);
        parent.children.delete(name); return this.ok();
      }
      case 'cat': {
        if (!args.length) return this.ok(stdin);
        const outputs: string[] = [];
        for (const file of args) { const data = this.readFile(file); if (data === null) return this.fail(`cat: ${file}: No such file or directory`); outputs.push(data); }
        return this.ok(outputs.join(''));
      }
      case 'grep': {
        const [pattern, file] = args;
        if (!pattern) return this.fail('grep: missing pattern');
        const data = file ? this.readFile(file) : stdin;
        if (file && data === null) return this.fail(`grep: ${file}: No such file or directory`);
        return this.ok((data ?? '').split('\n').filter(line => line.includes(pattern)).join('\n'));
      }
      case 'head': return this.ok((stdin || this.readFile(args[0] || '') || '').split('\n').slice(0, 10).join('\n'));
      case 'wc': {
        const data = stdin || this.readFile(args.find(a => !a.startsWith('-')) || '') || '';
        const lines = data ? data.split('\n').length - (data.endsWith('\n') ? 1 : 0) : 0;
        return this.ok(`      ${lines}      ${data.trim() ? data.trim().split(/\s+/).length : 0}      ${data.length}`);
      }
      case 'nano': case 'vi': case 'vim': {
        const file = args[0] || 'main.c'; const current = this.readFile(file) ?? ''; if (!this.readFile(file)) this.writeFile(file, '');
        this.onEditorOpen?.(file, current); return this.ok(`\x1b[33m[Opened '${file}' in Code Editor]\x1b[0m`);
      }
      case 'gcc': case 'clang': {
        const source = args.find(a => !a.startsWith('-'));
        if (!source) return this.fail(`${cmd}: fatal error: no input files\ncompilation terminated.`);
        if (this.readFile(source) === null) return this.fail(`${cmd}: error: ${source}: No such file or directory`);
        const outIndex = args.indexOf('-o'); const binary = outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : 'a.out';
        this.writeFile(binary, `__TRANSPILED_C__:${source}`); return this.ok();
      }
      case 'java': {
        const cls = args[0]; if (!cls) return this.fail('Usage: java [options] <mainclass> [args...]');
        const header = this.readFile(`${cls.replace('.class', '')}.class`);
        if (!header?.startsWith('__TRANSPILED_JAVA__:')) return this.fail(`Error: Could not find or load main class ${cls}`);
        const source = this.readFile(header.split(':')[1] ?? '') ?? ''; return this.ok(this.executeGeneralCode(source, 'java'));
      }
      case 'javac': {
        const source = args[0]; if (!source) return this.fail('javac: no source files specified');
        if (this.readFile(source) === null) return this.fail(`javac: file not found: ${source}`);
        const text = this.readFile(source)!; const match = text.match(/(?:public\s+)?class\s+([A-Za-z0-9_]+)/); const name = match?.[1] ?? source.replace(/\.java$/, '');
        this.writeFile(`${name}.class`, `__TRANSPILED_JAVA__:${source}`); return this.ok();
      }
      case 'ping': return this.ok(`PING ${args[0] || '8.8.8.8'}\n3 packets transmitted, 3 received, 0% packet loss`);
      case 'curl': return this.ok(`HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"engine":"Simulator"}`);
      case 'ps': return this.ok('  PID TTY          TIME CMD\n    1 ?        00:00:01 init\n   45 pts/0    00:00:00 bash');
      case 'top': case 'htop': return this.ok('Tasks: 2 total, 1 running, 1 sleeping\n%Cpu(s): 1.0 us, 99.0 id');
      case 'free': return this.ok('               total        used        free\nMem:          256000       58240      197760\nSwap:              0           0           0');
      case 'df': return this.ok('Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/root        8256000   1420000   6416000  18% /');
      case 'ifconfig': case 'ip': return this.ok('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.122.45  netmask 255.255.255.0');
      default: return this.fail(`bash: ${cmd}: command not found`, 127);
    }
  }

  public executeGeneralCode(code: string, language: 'c' | 'java', injectedVars?: Record<string, number>): string {
    const outputs: string[] = [];
    try {
      let runnable = code.replace(/#include\s*<[^>]+>/g, '').replace(/import\s+[^;]+;/g, '').replace(/package\s+[^;]+;/g, '');
      if (language === 'java') runnable = runnable.replace(/(?:public\s+)?class\s+\w+\s*\{/, '').replace(/}\s*$/, '');
      runnable = runnable.replace(/(?:public\s+)?(?:static\s+)?(?:void|int)\s+main\s*\([^)]*\)\s*\{/, 'function main() {');
      runnable = runnable.replace(/System\.out\.println\s*\((.*?)\)\s*;/g, (_m, expr) => `__out.push(String(${expr}) + "\\n");`);
      runnable = runnable.replace(/System\.out\.print\s*\((.*?)\)\s*;/g, (_m, expr) => `__out.push(String(${expr}));`);
      runnable = runnable.replace(/printf\s*\(\s*"([^"]*)"(?:\s*,\s*(.*?))?\s*\);/g, (_m, fmt, args) => args ? `__out.push(__formatPrintf(${JSON.stringify(fmt)}, ${args}));` : `__out.push(${JSON.stringify(fmt)});`);
      runnable = runnable.replace(/\b(?:int|long|short|float|double|boolean|bool|char|String)\s+([A-Za-z_]\w*)/g, 'let $1');
      runnable = runnable.replace(/return\s+0\s*;/g, 'return;');
      let prefix = ''; for (const [key, value] of Object.entries(injectedVars ?? {})) { prefix += `let ${key} = ${value};\n`; runnable = runnable.replace(new RegExp(`let\\s+${key}\\s*=[^;]+;`, 'g'), ''); }
      const runner = new Function('__out', '__formatPrintf', `${prefix}\n${runnable}\nif (typeof main === 'function') main();`);
      const formatPrintf = (fmt: string, ...args: unknown[]) => { let i = 0; return fmt.replace(/%[dfsSc]/g, () => String(args[i++] ?? '')); };
      runner(outputs, formatPrintf); return outputs.join('') || 'Program exited with code 0.';
    } catch (error) { return `\x1b[31m[Transpiler Error]:\x1b[0m ${error instanceof Error ? error.message : String(error)}`; }
  }
}
