export interface CommandResult { stdout: string; stderr: string; exitCode: number }
export type CommandHandler = (args: string[], stdin: string) => CommandResult;
export class CommandRegistry {
  private readonly commands = new Map<string, CommandHandler>();
  register(name: string, handler: CommandHandler): void { this.commands.set(name, handler); }
  has(name: string): boolean { return this.commands.has(name); }
  run(name: string, args: string[], stdin: string): CommandResult {
    const handler = this.commands.get(name);
    return handler ? handler(args, stdin) : { stdout: '', stderr: `bash: ${name}: command not found`, exitCode: 127 };
  }
  names(): string[] { return [...this.commands.keys()].sort(); }
}
