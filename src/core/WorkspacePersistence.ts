import { StorageService } from './StorageService';
import type { VirtualNode } from '../engine/LinuxEngine';

export interface PersistedNode { name: string; type: 'file' | 'dir'; content?: string; permissions?: string; executable?: boolean; owner?: string; group?: string; children?: PersistedNode[]; }
export interface WorkspaceState { version: 1; root: PersistedNode; cwdPath: string[]; env: [string, string][]; history: string[]; currentFile: string; assessment?: unknown; updatedAt: number; }

function serialize(node: VirtualNode): PersistedNode {
  return { name: node.name, type: node.type, content: node.content, permissions: node.permissions, executable: node.executable, owner: node.owner, group: node.group, children: node.children ? [...node.children.values()].map(serialize) : undefined };
}
function hydrate(node: PersistedNode, parent?: VirtualNode): VirtualNode {
  const result: VirtualNode = { name: node.name, type: node.type, content: node.content, permissions: node.permissions, executable: node.executable, owner: node.owner, group: node.group, parent };
  if (node.type === 'dir') {
    result.children = new Map();
    for (const child of node.children ?? []) { const hydrated = hydrate(child, result); result.children.set(hydrated.name, hydrated); }
  }
  return result;
}

export class WorkspacePersistence {
  static async save(engine: { root: VirtualNode; cwdPath: string[]; env: Map<string,string>; history: string[] }, currentFile: string, assessment?: unknown): Promise<void> {
    const state: WorkspaceState = { version: 1, root: serialize(engine.root), cwdPath: [...engine.cwdPath], env: [...engine.env.entries()], history: [...engine.history].slice(-100), currentFile, assessment, updatedAt: Date.now() };
    await StorageService.saveWorkspaceState(state);
  }
  static async load(): Promise<WorkspaceState | null> { return StorageService.getWorkspaceState() as Promise<WorkspaceState | null>; }
  static restore(engine: { root: VirtualNode; cwdPath: string[]; env: Map<string,string>; history: string[] }, state: WorkspaceState): void {
    engine.root = hydrate(state.root);
    engine.cwdPath = [...state.cwdPath];
    engine.env = new Map(state.env);
    engine.history = [...state.history];
  }
}
