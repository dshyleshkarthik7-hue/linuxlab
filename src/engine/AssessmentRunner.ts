import { InBrowserLinuxEngine } from './LinuxEngine';

export interface TestCase {
  id: number;
  description: string;
  injectedVar: { name: string; value: number };
  expectedSubstring: string;
}

export class AssessmentRunner {
  private engine: InBrowserLinuxEngine;

  constructor(engine: InBrowserLinuxEngine) {
    this.engine = engine;
  }

  public runCTestSuite(sourceCode: string): { passed: number; total: number; logs: string[] } {
    const testCases: TestCase[] = [
      { id: 1, description: 'Table num=5 (Step 1)', injectedVar: { name: 'num', value: 5 }, expectedSubstring: '5 x 1 = 5' },
      { id: 2, description: 'Table num=5 (Step 10)', injectedVar: { name: 'num', value: 5 }, expectedSubstring: '5 x 10 = 50' },
      { id: 3, description: 'Table num=9 (Step 5)', injectedVar: { name: 'num', value: 9 }, expectedSubstring: '9 x 5 = 45' },
      { id: 4, description: 'Table num=12 (Step 10)', injectedVar: { name: 'num', value: 12 }, expectedSubstring: '12 x 10 = 120' },
    ];

    return this.evaluateSuite(sourceCode, 'c', testCases);
  }

  public runJavaTestSuite(sourceCode: string): { passed: number; total: number; logs: string[] } {
    const testCases: TestCase[] = [
      { id: 1, description: 'Prime test for 7', injectedVar: { name: 'num', value: 7 }, expectedSubstring: '7 is a Prime Number' },
      { id: 2, description: 'Composite test for 8', injectedVar: { name: 'num', value: 8 }, expectedSubstring: '8 is not a Prime Number' },
      { id: 3, description: 'Prime test for 13', injectedVar: { name: 'num', value: 13 }, expectedSubstring: '13 is a Prime Number' },
    ];

    return this.evaluateSuite(sourceCode, 'java', testCases);
  }

  private evaluateSuite(code: string, lang: 'c' | 'java', suite: TestCase[]) {
    let passed = 0;
    const logs: string[] = [];
    const startTime = performance.now();

    for (const tc of suite) {
      const output = this.engine.executeGeneralCode(code, lang, { [tc.injectedVar.name]: tc.injectedVar.value });
      const isSuccess = output.includes(tc.expectedSubstring);

      if (isSuccess) {
        passed++;
        logs.push(`<div class="test-pass" style="color: #4ade80; margin: 3px 0;">✓ [Passed] ${tc.description}</div>`);
      } else {
        logs.push(
          `<div class="test-fail" style="color: #fb7185; margin: 3px 0;">✗ [Failed] ${tc.description} (Expected "${tc.expectedSubstring}")</div>`
        );
      }
    }

    const elapsed = (performance.now() - startTime).toFixed(2);
    logs.unshift(`<div style="margin-bottom: 8px; color: #38bdf8;">Execution Completed in <strong>${elapsed} ms</strong> (${passed}/${suite.length} Passed)</div>`);

    return { passed, total: suite.length, logs };
  }
}