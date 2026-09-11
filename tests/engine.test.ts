import { describe, expect, it, beforeEach } from 'vitest';
import { parseShell } from '../src/engine/ShellParser';
import { InBrowserLinuxEngine } from '../src/engine/LinuxEngine';
import { AssessmentRunner } from '../src/engine/AssessmentRunner';

describe('ShellParser', () => {
  it('parses quoting, pipeline and redirection', () => {
    const ast = parseShell("echo 'hello world' | grep hello > out.txt");
    expect(ast.type).toBe('pipeline');
    expect(ast.pipeline?.commands).toHaveLength(2);
    expect(ast.pipeline?.commands[1].stdout?.path).toBe('out.txt');
  });
  it('rejects malformed syntax', () => {
    expect(() => parseShell('echo hi |')).toThrow();
    expect(() => parseShell("echo 'unterminated")).toThrow();
  });
});

describe('LinuxEngine', () => {
  let engine: InBrowserLinuxEngine;
  beforeEach(() => { engine = new InBrowserLinuxEngine(); });
  it('normalizes filesystem paths', async () => {
    await engine.execute('cd /root');
    await engine.execute('mkdir demo');
    await engine.execute('cd demo');
    await engine.execute('cd ..');
    expect(engine.getCwd()).toBe('/root');
  });
  it('returns shell exit codes', async () => {
    expect((await engine.executeResult('true')).exitCode).toBe(0);
    expect((await engine.executeResult('false')).exitCode).toBe(1);
    expect((await engine.executeResult('missing-command')).exitCode).toBe(127);
  });
  it('supports pipeline and redirection against the same filesystem', async () => {
    await engine.execute("echo alpha | grep alpha > result.txt");
    expect(engine.readFile('/root/result.txt')).toContain('alpha');
  });
  it('compiles and executes C through the educational interpreter', async () => {
    const result = await engine.executeResult('gcc main.c -o table && ./table');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('5 x 10 = 50');
  });
  it('keeps reset on the same engine instance', async () => {
    await engine.execute('touch changed.txt');
    engine.reset();
    expect(engine.readFile('/root/changed.txt')).toBeNull();
    expect(engine.getCwd()).toBe('/root');
  });
});

describe('AssessmentRunner', () => {
  it('passes the seeded C exercise', () => {
    const engine = new InBrowserLinuxEngine();
    const source = engine.readFile('/root/main.c')!;
    const result = new AssessmentRunner(engine).runCTestSuite(source);
    expect(result.status).toBe('passed');
    expect(result.passed).toBe(result.total);
  });
  it('does not report an execution failure as a pass', () => {
    const engine = new InBrowserLinuxEngine();
    const result = new AssessmentRunner(engine).runCTestSuite('int main(){ unknown(); }');
    expect(result.status).not.toBe('passed');
  });
});
