import { InBrowserLinuxEngine } from './LinuxEngine';

export interface TestCase {
  id: number;
  description: string;
  injectedVar: { name: string; value: number };
  expectedSubstring: string;
}

export interface AssessmentResult {
  status: 'passed' | 'failed' | 'unable_to_verify';
  passed: number;
  total: number;
  logs: string[];
}

export class AssessmentRunner {
  constructor(private readonly engine: InBrowserLinuxEngine) {}

  public runCTestSuite(sourceCode: string): AssessmentResult {
    return this.evaluateSuite(sourceCode, 'c', [
      { id: 1, description: 'Table num=5 (Step 1)', injectedVar: { name: 'num', value: 5 }, expectedSubstring: '5 x 1 = 5' },
      { id: 2, description: 'Table num=5 (Step 10)', injectedVar: { name: 'num', value: 5 }, expectedSubstring: '5 x 10 = 50' },
      { id: 3, description: 'Table num=9 (Step 5)', injectedVar: { name: 'num', value: 9 }, expectedSubstring: '9 x 5 = 45' },
      { id: 4, description: 'Table num=12 (Step 10)', injectedVar: { name: 'num', value: 12 }, expectedSubstring: '12 x 10 = 120' },
    ]);
  }

  public runJavaTestSuite(sourceCode: string): AssessmentResult {
    return this.evaluateSuite(sourceCode, 'java', [
      { id: 1, description: 'Prime test for 7', injectedVar: { name: 'num', value: 7 }, expectedSubstring: '7 is a Prime Number' },
      { id: 2, description: 'Composite test for 8', injectedVar: { name: 'num', value: 8 }, expectedSubstring: '8 is not a Prime Number' },
      { id: 3, description: 'Prime test for 13', injectedVar: { name: 'num', value: 13 }, expectedSubstring: '13 is a Prime Number' },
    ]);
  }

  private evaluateSuite(code: string, language: 'c' | 'java', suite: TestCase[]): AssessmentResult {
    let passed = 0;
    let unverifiable = false;
    const logs: string[] = [];
    const started = performance.now();

    for (const tc of suite) {
      const output = this.engine.executeGeneralCode(code, language, { [tc.injectedVar.name]: tc.injectedVar.value });
      const transpilerError = /\[Transpiler Error\]/.test(output);
      const verified = !transpilerError && output.includes(tc.expectedSubstring);

      if (transpilerError) {
        unverifiable = true;
        logs.push(`<div class="test-unknown">? [Unable to verify] ${tc.description}: execution failed</div>`);
      } else if (verified) {
        passed++;
        logs.push(`<div class="test-pass">✓ [Passed] ${tc.description}</div>`);
      } else {
        logs.push(`<div class="test-fail">✗ [Failed] ${tc.description} (expected output was not produced)</div>`);
      }
    }

    const status: AssessmentResult['status'] = unverifiable ? 'unable_to_verify' : passed === suite.length ? 'passed' : 'failed';
    logs.unshift(`<div>Execution completed in ${ (performance.now() - started).toFixed(2) } ms — ${passed}/${suite.length} verified</div>`);
    if (status === 'unable_to_verify') logs.unshift('<div>Assessment is inconclusive because at least one test could not be executed.</div>');
    return { status, passed, total: suite.length, logs };
  }
}
