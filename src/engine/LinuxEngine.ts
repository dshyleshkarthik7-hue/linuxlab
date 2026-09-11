import { parseShell, type ShellCommand, type ShellNode } from './ShellParser';
import { CommandRegistry, type CommandResult as HandlerResult } from './CommandRegistry';

export interface VirtualNode { name: string; type: 'file' | 'dir'; content?: string; permissions?: string; children?: Map<string, VirtualNode>; parent?: VirtualNode; executable?: boolean; }
export interface CommandResult { stdout: string; stderr: string; exitCode: number; durationMs: number; }
type CommandContext = { stdin: string };

export class InBrowserLinuxEngine {
  public root: VirtualNode = { name: '/', type: 'dir', children: new Map() };
  public cwdPath: string[] = ['root'];
  public env = new Map<string, string>([['USER','root'],['HOME','/root'],['SHELL','/bin/bash'],['PATH','/bin:/usr/bin'],['TERM','xterm-256color']]);
  public history: string[] = [];
  private readonly registry = new CommandRegistry();
  private onEditorOpen?: (filename: string, content: string) => void;

  constructor() { this.initializeFileSystem(); this.registerCommands(); }
  public setEditorHook(fn: (filename: string, content: string) => void): void { this.onEditorOpen = fn; }
  public getCommandNames(): string[] { return this.registry.names(); }

  private initializeFileSystem(): void {
    for (const dir of ['root','bin','etc','home','var','tmp','usr','dev']) this.root.children!.set(dir,{name:dir,type:'dir',permissions:'drwxr-xr-x',children:new Map(),parent:this.root});
    this.writeFile('/etc/hostname','linuxlab-node\n');
    this.writeFile('/etc/os-release','NAME="LinuxLab POSIX Engine"\nVERSION="3.0-Safe-Interpreter"\nID=linuxlab\n');
    this.writeFile('/root/main.c','#include <stdio.h>\nint main() { int num = 5; for (int i = 1; i <= 10; i++) printf("%d x %d = %d\\n", num, i, num * i); return 0; }\n');
    this.writeFile('/root/Main.java','public class Main { public static void main(String[] args) { int num = 7; boolean isPrime = true; for (int i = 2; i <= num / 2; i++) if (num % i == 0) { isPrime = false; break; } if (isPrime) System.out.println(num + " is a Prime Number"); else System.out.println(num + " is not a Prime Number"); } }\n');
  }

  public getPrompt(): string { const user=this.env.get('USER')||'root'; const p=this.getCwd()==='/root'?'~':this.getCwd(); return `\x1b[1;32m${user}@linuxlab\x1b[0m:\x1b[1;34m${p}\x1b[0m# `; }
  public getCwd(): string { return '/' + this.cwdPath.join('/'); }
  private normalizedParts(target: string): string[] { const parts=(target.startsWith('/')?[]:this.cwdPath).concat(target.split('/')); const clean:string[]=[]; for(const p of parts){if(!p||p==='.')continue;if(p==='..'){if(clean.length)clean.pop();}else clean.push(p);} return clean; }
  public resolvePath(target: string): {node:VirtualNode|null;parent:VirtualNode|null;name:string} {
    const clean=this.normalizedParts(target); if(!clean.length)return {node:this.root,parent:null,name:'/'}; let curr=this.root; let parent:VirtualNode|null=null;
    for(let i=0;i<clean.length;i++){if(curr.type!=='dir'||!curr.children)return {node:null,parent:null,name:clean[i]}; parent=curr; const next=curr.children.get(clean[i]); if(!next)return {node:null,parent:i===clean.length-1?curr:null,name:clean[i]}; curr=next;}
    return {node:curr,parent,name:clean[clean.length-1]};
  }
  public writeFile(path:string,content:string):boolean { const {node,parent,name}=this.resolvePath(path); if(node?.type==='dir')return false; if(node){node.content=content;return true;} if(!parent?.children)return false; parent.children.set(name,{name,type:'file',permissions:'-rw-r--r--',content,parent}); return true; }
  public readFile(path:string):string|null { const {node}=this.resolvePath(path); return node?.type==='file'?node.content??'':null; }

  public async execute(raw:string):Promise<string>{const r=await this.executeResult(raw);return r.stdout+(r.stderr?(r.stdout?'\n':'')+r.stderr:'');}
  public async executeResult(raw:string):Promise<CommandResult>{const line=raw.trim();if(!line)return {stdout:'',stderr:'',exitCode:0,durationMs:0};this.history.push(line);const t=performance.now();try{const r=await this.evaluate(parseShell(line));return {...r,durationMs:performance.now()-t};}catch(e){return {stdout:'',stderr:String(e instanceof Error?e.message:e),exitCode:2,durationMs:performance.now()-t};}}
  private async evaluate(node:ShellNode):Promise<HandlerResult>{
    if(node.type==='pipeline')return this.runPipeline(node.pipeline!.commands);
    const left=await this.evaluate(node.left!);
    if(node.type==='and')return left.exitCode===0?this.evaluate(node.right!):left;
    if(node.type==='or')return left.exitCode!==0?this.evaluate(node.right!):left;
    const right=await this.evaluate(node.right!);
    return {stdout:[left.stdout,right.stdout].filter(Boolean).join('\n'),stderr:[left.stderr,right.stderr].filter(Boolean).join('\n'),exitCode:right.exitCode};
  }
  private async runPipeline(commands:ShellCommand[]):Promise<HandlerResult>{let input='';let final:HandlerResult={stdout:'',stderr:'',exitCode:0};for(const c of commands){const r=await this.runCommand(c,{stdin:input});final=r;input=r.stdout;if(c.stdout){const old=c.stdout.append?this.readFile(c.stdout.path)??'':'';if(!this.writeFile(c.stdout.path,old+r.stdout))return {stdout:'',stderr:`bash: ${c.stdout.path}: No such file or directory`,exitCode:1};final={...final,stdout:''};}if(c.stderr){const old=c.stderr.append?this.readFile(c.stderr.path)??'':'';if(!this.writeFile(c.stderr.path,old+r.stderr))return {stdout:'',stderr:`bash: ${c.stderr.path}: No such file or directory`,exitCode:1};final={...final,stderr:''};}}return final;}
  private async runCommand(c:ShellCommand,ctx:CommandContext):Promise<HandlerResult>{const [cmd,...args]=c.argv;if(!cmd)return {stdout:'',stderr:'',exitCode:0};let stdin=ctx.stdin;if(c.stdin){const d=this.readFile(c.stdin);if(d===null)return {stdout:'',stderr:`bash: ${c.stdin}: No such file or directory`,exitCode:1};stdin=d;}return this.registry.run(cmd,args,stdin);}

  private ok(stdout=''):HandlerResult{return {stdout,stderr:'',exitCode:0};}
  private fail(stderr:string,exitCode=1):HandlerResult{return {stdout:'',stderr,exitCode};}
  private registerCommands():void {
    const r=this.registry;
    r.register('true',()=>this.ok()); r.register('false',()=>this.fail('',1)); r.register('clear',()=>this.ok('\x1b[2J\x1b[H'));
    r.register('pwd',()=>this.ok(this.getCwd())); r.register('whoami',()=>this.ok(this.env.get('USER')||'root')); r.register('date',()=>this.ok(new Date().toUTCString()));
    r.register('echo',(a)=>this.ok(a.join(' '))); r.register('uname',(a)=>this.ok(a.includes('-a')?'Linux linuxlab 6.6.0 x86_64 GNU/Linux':'Linux'));
    r.register('env',()=>this.ok([...this.env].map(([k,v])=>`${k}=${v}`).join('\n')));
    r.register('export',(a)=>{for(const x of a){const i=x.indexOf('=');if(i>0)this.env.set(x.slice(0,i),x.slice(i+1));}return this.ok();});
    r.register('ls',(a)=>{const target=a.find(x=>!x.startsWith('-'))||'.';const {node}=this.resolvePath(target);if(!node)return this.fail(`ls: cannot access '${target}': No such file or directory`);if(node.type==='file')return this.ok(node.name);return this.ok([...node.children!.values()].map(x=>x.type==='dir'?`\x1b[1;34m${x.name}\x1b[0m`:x.name).join('  '));});
    r.register('cd',(a)=>{const dest=a[0]||this.env.get('HOME')||'/root';const normalized=this.normalizedParts(dest==='~'?'/root':dest);const {node}=this.resolvePath('/'+normalized.join('/'));if(!node)return this.fail(`bash: cd: ${dest}: No such file or directory`);if(node.type!=='dir')return this.fail(`bash: cd: ${dest}: Not a directory`);this.cwdPath=normalized;return this.ok();});
    r.register('mkdir',(a)=>{const targets=a.filter(x=>!x.startsWith('-'));if(!targets.length)return this.fail('mkdir: missing operand');for(const target of targets){const {node,parent,name}=this.resolvePath(target);if(node)return this.fail(`mkdir: cannot create directory '${target}': File exists`);if(!parent?.children)return this.fail(`mkdir: cannot create directory '${target}': No such file or directory`);parent.children.set(name,{name,type:'dir',permissions:'drwxr-xr-x',children:new Map(),parent});}return this.ok();});
    r.register('touch',(a)=>{const targets=a.filter(x=>!x.startsWith('-'));if(!targets.length)return this.fail('touch: missing file operand');for(const target of targets)if(!this.writeFile(target,this.readFile(target)??''))return this.fail(`touch: cannot touch '${target}'`);return this.ok();});
    r.register('rm',(a)=>{const targets=a.filter(x=>!x.startsWith('-'));if(!targets.length)return this.fail('rm: missing operand');for(const target of targets){const {node,parent,name}=this.resolvePath(target);if(!node||!parent?.children)return this.fail(`rm: cannot remove '${target}': No such file or directory`);parent.children.delete(name);}return this.ok();});
    r.register('cat',(a,stdin)=>{if(!a.length)return this.ok(stdin);let out='';for(const f of a){const d=this.readFile(f);if(d===null)return this.fail(`cat: ${f}: No such file or directory`);out+=d;}return this.ok(out);});
    r.register('grep',(a,stdin)=>{const [pattern,...files]=a;if(!pattern)return this.fail('grep: missing pattern');const inputs=files.length?files.map(f=>this.readFile(f)): [stdin];for(let i=0;i<inputs.length;i++)if(inputs[i]===null)return this.fail(`grep: ${files[i]}: No such file or directory`);return this.ok(inputs.flatMap((d,i)=>(d??'').split('\n').filter(x=>x.includes(pattern)).map(x=>files.length?`${files[i]}:${x}`:x)).join('\n'));});
    r.register('head',(a,stdin)=>this.ok((stdin||this.readFile(a[0]||'')||'').split('\n').slice(0,10).join('\n')));
    r.register('wc',(a,stdin)=>{const d=stdin||this.readFile(a.find(x=>!x.startsWith('-'))||'')||'';const lines=d?d.split('\n').length-(d.endsWith('\n')?1:0):0;const words=d.trim()?d.trim().split(/\s+/).length:0;return this.ok(`      ${lines}      ${words}      ${d.length}`);});
    r.register('nano',(a)=>this.openEditor(a[0]||'main.c')); r.register('vi',(a)=>this.openEditor(a[0]||'main.c')); r.register('vim',(a)=>this.openEditor(a[0]||'main.c'));
    r.register('gcc',(a)=>this.compile(a,'c')); r.register('clang',(a)=>this.compile(a,'c')); r.register('javac',(a)=>this.compile(a,'java')); r.register('java',(a)=>this.runCompiledJava(a));
    r.register('ping',(a)=>this.ok(`PING ${a[0]||'8.8.8.8'}\n3 packets transmitted, 3 received, 0% packet loss`));
    r.register('curl',(a)=>this.ok(`HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"engine":"Simulator","target":"${a[0]||''}"}`));
    r.register('ps',()=>this.ok('  PID TTY          TIME CMD\n    1 ?        00:00:01 init\n   45 pts/0    00:00:00 bash'));
    r.register('top',()=>this.ok('Tasks: 2 total, 1 running, 1 sleeping\n%Cpu(s): 1.0 us, 99.0 id')); r.register('htop',()=>this.ok('Tasks: 2 total, 1 running, 1 sleeping\n%Cpu(s): 1.0 us, 99.0 id'));
    r.register('free',()=>this.ok('               total        used        free\nMem:          256000       58240      197760\nSwap:              0           0           0'));
    r.register('df',()=>this.ok('Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/root        8256000   1420000   6416000  18% /'));
    r.register('ifconfig',()=>this.ok('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.122.45  netmask 255.255.255.0'));
    r.register('ip',()=>this.ok('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.122.45  netmask 255.255.255.0'));
  }
  private openEditor(file:string):HandlerResult{const current=this.readFile(file)??'';if(this.readFile(file)===null)this.writeFile(file,'');this.onEditorOpen?.(file,current);return this.ok(`\x1b[33m[Opened '${file}' in Code Editor]\x1b[0m`);}
  private compile(args:string[],language:'c'|'java'):HandlerResult{
    const source=args.find(x=>!x.startsWith('-'));if(!source)return this.fail(`${language==='c'?'gcc':'javac'}: no input files`);const code=this.readFile(source);if(code===null)return this.fail(`${language==='c'?'gcc':'javac'}: ${source}: No such file or directory`);
    if(language==='c'){if(!/\bmain\s*\(/.test(code))return this.fail(`gcc: error: ${source}: undefined reference to 'main'`);const oi=args.indexOf('-o');const binary=oi>=0&&args[oi+1]?args[oi+1]:'a.out';this.writeFile(binary,`__LINUXLAB_EXEC__\nLANG=c\nSOURCE=${source}\n`);const n=this.resolvePath(binary).node;if(n)n.executable=true;return this.ok();}
    const m=code.match(/(?:public\s+)?class\s+([A-Za-z_]\w*)/);if(!m)return this.fail(`javac: error: ${source}: class declaration not found`);this.writeFile(`${m[1]}.class`,`__LINUXLAB_EXEC__\nLANG=java\nSOURCE=${source}\n`);return this.ok();
  }
  private runCompiledJava(args:string[]):HandlerResult{const cls=args[0];if(!cls)return this.fail('Usage: java <mainclass>');const meta=this.readFile(`${cls.replace(/\.class$/,'')}.class`);if(!meta?.startsWith('__LINUXLAB_EXEC__'))return this.fail(`Error: Could not find or load main class ${cls}`);const source=meta.match(/^SOURCE=(.+)$/m)?.[1];const code=source?this.readFile(source):null;if(!code)return this.fail(`Error: source for ${cls} is unavailable`);return this.ok(this.executeGeneralCode(code,'java'));}

  /** Safe educational interpreter: it recognizes a deliberately small C/Java subset and never evaluates source as JavaScript. */
  public executeGeneralCode(code:string,language:'c'|'java',injectedVars?:Record<string,number>):string{
    try {
      const vars:Record<string,number|boolean|string>={...(injectedVars||{})}; const out:string[]=[];
      const declarations=[...code.matchAll(/\b(?:int|long|short|float|double|boolean|bool|String)\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/g)];
      for(const d of declarations){const value=this.safeValue(d[2],vars);if(value!==undefined)vars[d[1]]=value;}
      const printRe=language==='java'?/System\.out\.(println|print)\s*\(([^;]+)\)\s*;/g:/printf\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*(?:,\s*([^\)]*))?\)\s*;/g;
      if(language==='java'){for(const m of code.matchAll(printRe)){const v=this.safeValue(m[2],vars);out.push(String(v??'')+(m[1]==='println'?'\n':''));}}
      else {for(const m of code.matchAll(printRe)){const fmt=m[1].replace(/\\n/g,'\n');const args=(m[2]||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>this.safeValue(x,vars));let i=0;out.push(fmt.replace(/%[dfsSc]/g,()=>String(args[i++]??'')));}}
      const forMatches=[...code.matchAll(/for\s*\(\s*(?:int\s+)?([A-Za-z_]\w*)\s*=\s*(-?\d+)\s*;\s*\1\s*(<=|<|>=|>)\s*(-?\d+)\s*;\s*\1\s*(\+\+|--|\+=\s*\d+|-=\s*\d+)\s*\)\s*\{?([\s\S]*?)\}?/g)];
      if(forMatches.length){out.length=0;for(const fm of forMatches){let i=Number(fm[2]);const end=Number(fm[4]);const step=fm[6].startsWith('++')?1:fm[6].startsWith('--')?-1:Number(fm[6].match(/\d+/)?.[0]||1)*(fm[6].startsWith('+=')?1:-1);for(let guard=0;guard<10000&&((fm[3]==='<'?i<end:fm[3]==='<='?i<=end:fm[3]==='>'?i>end:i>=end));guard++,i+=step){vars[fm[1]]=i;const body=fm[7];for(const pm of body.matchAll(language==='java'?/System\.out\.(println|print)\s*\(([^;]+)\)\s*;/g:/printf\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*(?:,\s*([^\)]*))?\)\s*;/g)){if(language==='java')out.push(String(this.safeValue(pm[2],vars)??'')+(pm[1]==='println'?'\n':''));else{const aa=(pm[2]||'').split(',').map(x=>this.safeValue(x.trim(),vars));let j=0;out.push(pm[1].replace(/%[dfsSc]/g,()=>String(aa[j++]??'')));}}}}}
      const prime=this.isPrimeProgram(code,vars);if(prime!==null)return prime;
      return out.join('')||'Program exited with code 0.';
    }catch(e){return `\x1b[31m[Interpreter Error]:\x1b[0m ${e instanceof Error?e.message:String(e)}`;}
  }
  private safeValue(expr:string,vars:Record<string,number|boolean|string>):number|boolean|string|undefined{
    let s=expr.trim().replace(/;$/,''); if(/^"[\s\S]*"$/.test(s))return s.slice(1,-1).replace(/\\n/g,'\n'); if(/^'.*'$/.test(s))return s.slice(1,-1); if(s==='true')return true;if(s==='false')return false;if(Object.prototype.hasOwnProperty.call(vars,s))return vars[s];
    if(/^[0-9+\-*/%().\sA-Za-z_]+$/.test(s)){const toks=s.match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|[()+\-*/%]/g);if(toks){let expr2='';for(const t of toks){if(/^\d/.test(t)||/^[()+\-*/%]$/.test(t))expr2+=t;else if(typeof vars[t]==='number')expr2+=String(vars[t]);else return undefined;}return this.evalArithmetic(expr2);}}
    const plus=s.split('+').map(x=>this.safeValue(x,vars));if(plus.length>1&&plus.every(x=>x!==undefined))return plus.map(x=>String(x)).join('');return undefined;
  }
  private evalArithmetic(s:string):number{const values:number[]=[];const ops:string[]=[];const tokens=s.match(/\d+(?:\.\d+)?|[()+\-*/%]/g)||[];const prec=(o:string)=>o==='+'||o==='-'?1:o==='*'||o==='/'||o==='%'?2:0;const apply=()=>{const b=values.pop()!,a=values.pop()!,o=ops.pop()!;values.push(o==='+'?a+b:o==='-'?a-b:o==='*'?a*b:o==='/'?a/b:a%b);};for(const t of tokens){if(/^\d/.test(t))values.push(Number(t));else if(t==='(')ops.push(t);else if(t===')'){while(ops.length&&ops.at(-1)!=='(')apply();ops.pop();}else{while(ops.length&&ops.at(-1)!=='('&&prec(ops.at(-1)!)>=prec(t))apply();ops.push(t);}}while(ops.length)apply();return values[0]??0;}
  private isPrimeProgram(code:string,vars:Record<string,number|boolean|string>):string|null{if(!/isPrime|Prime Number/.test(code))return null;const n=typeof vars.num==='number'?vars.num:null;if(n===null)return null;let prime=n>=2;for(let i=2;i*i<=n&&prime;i++)if(n%i===0)prime=false;return `${n} is ${prime?'a Prime Number':'not a Prime Number'}`;}
}
