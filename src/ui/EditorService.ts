import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { StorageService } from '../core/StorageService';
import { EventBus, EVENTS } from '../core/EventBus';

// Monaco environment for workers
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

export class EditorService {
  private editor!: monaco.editor.IStandaloneCodeEditor;
  private currentFilename: string = 'script.sh';
  private saveDebounceTimer: number | null = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Editor container #${containerId} not found`);

    this.editor = monaco.editor.create(container, {
      value: '// Select a lab exercise to load code',
      language: 'shell',
      theme: 'vs-dark',
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 12 },
      lineNumbers: 'on',
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      tabSize: 2,
    });

    // Auto-save on change (debounced)
    this.editor.onDidChangeModelContent(() => {
      const content = this.editor.getValue();
      if (this.saveDebounceTimer) window.clearTimeout(this.saveDebounceTimer);

      this.saveDebounceTimer = window.setTimeout(async () => {
        try {
          await StorageService.saveFile(this.currentFilename, content);
          // FIX: use emit instead of publish
          EventBus.getInstance().emit(EVENTS.FILE_CHANGED, {
            filename: this.currentFilename,
            content
          });
        } catch (err) {
          console.warn('Failed to save file:', err);
        }
      }, 600);
    });
  }

  async loadFile(filename: string, initialCode: string, language: string) {
    this.currentFilename = filename;

    let code = initialCode;
    try {
      const saved = await StorageService.getFile(filename);
      if (saved !== null) code = saved;
    } catch {
      // ignore, use initial
    }

    const model = this.editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(
        model,
        language === 'c' ? 'c' : language === 'shell' ? 'shell' : 'plaintext'
      );
    }
    this.editor.setValue(code);
    this.editor.focus();
  }

  getCode(): string {
    return this.editor.getValue();
  }

  getFilename(): string {
    return this.currentFilename;
  }

  setValue(code: string) {
    this.editor.setValue(code);
  }
}
