export type ShellOperator = '&&' | '||' | ';' | '|' | '>' | '>>' | '2>' | '2>>' | '<';

export interface ShellCommand {
  argv: string[];
  stdin?: string;
  stdout?: { path: string; append: boolean };
  stderr?: { path: string; append: boolean };
}

export interface ShellPipeline {
  commands: ShellCommand[];
}

export interface ShellNode {
  type: 'pipeline' | 'and' | 'or' | 'sequence';
  pipeline?: ShellPipeline;
  left?: ShellNode;
  right?: ShellNode;
}

interface Token { value: string; quoted: boolean }

const OPERATORS = ['2>>', '2>', '&&', '||', '>>', '|', ';', '>', '<'] as const;

function isOperatorAt(input: string, index: number): string | null {
  for (const op of OPERATORS) if (input.startsWith(op, index)) return op;
  return null;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let value = '';
  let quoted = false;
  let quote: '"' | "'" | null = null;

  const push = () => {
    if (value.length) tokens.push({ value, quoted });
    value = '';
    quoted = false;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      if (ch === '\\' && quote === '"' && i + 1 < input.length) { value += input[++i]; continue; }
      value += ch;
      quoted = true;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; quoted = true; continue; }
    if (ch === '\\') {
      if (i + 1 >= input.length) throw new Error('syntax error: trailing escape');
      value += input[++i];
      continue;
    }
    if (/\s/.test(ch)) { push(); continue; }
    const op = isOperatorAt(input, i);
    if (op) { push(); tokens.push({ value: op, quoted: false }); i += op.length - 1; continue; }
    value += ch;
  }
  if (quote) throw new Error('syntax error: unterminated quote');
  push();
  return tokens;
}

export function parseShell(input: string): ShellNode {
  const tokens = tokenize(input.trim());
  if (!tokens.length) throw new Error('syntax error: empty command');
  let index = 0;

  const parsePipeline = (): ShellNode => {
    const commands: ShellCommand[] = [];
    while (true) {
      const argv: string[] = [];
      const command: ShellCommand = { argv };
      while (index < tokens.length && !['&&', '||', ';', '|'].includes(tokens[index].value)) {
        const token = tokens[index++];
        if (['>', '>>', '2>', '2>>', '<'].includes(token.value)) {
          if (index >= tokens.length || ['&&', '||', ';', '|', '>', '>>', '2>', '2>>', '<'].includes(tokens[index].value)) {
            throw new Error(`syntax error near unexpected token '${token.value}'`);
          }
          const path = tokens[index++].value;
          if (token.value === '<') command.stdin = path;
          else if (token.value.startsWith('2')) command.stderr = { path, append: token.value === '2>>' };
          else command.stdout = { path, append: token.value === '>>' };
        } else {
          argv.push(token.value);
        }
      }
      if (!argv.length) throw new Error('syntax error: expected command');
      commands.push(command);
      if (tokens[index]?.value !== '|') break;
      index++;
      if (index >= tokens.length) throw new Error('syntax error: expected command after |');
    }
    return { type: 'pipeline', pipeline: { commands } };
  };

  const parseAndOr = (): ShellNode => {
    let node = parsePipeline();
    while (tokens[index] && (tokens[index].value === '&&' || tokens[index].value === '||')) {
      const op = tokens[index++].value as '&&' | '||';
      const right = parsePipeline();
      node = { type: op === '&&' ? 'and' : 'or', left: node, right };
    }
    return node;
  };

  let node = parseAndOr();
  while (tokens[index]?.value === ';') {
    index++;
    if (index >= tokens.length) throw new Error('syntax error: expected command after ;');
    node = { type: 'sequence', left: node, right: parseAndOr() };
  }
  if (index < tokens.length) throw new Error(`syntax error near unexpected token '${tokens[index].value}'`);
  return node;
}
