import { GridTreeNodeData } from '../grid-view-types';
import { GridNode } from './grid-node';

/** Main grid data model. Holds the root tree and manages state. */
export class GridModel {
  private root: GridNode | null = null;

  /**
   * Update the model with new tree data from the engine.
   *
   * `expandDepth` is an optional opt-in for tests that need to exercise
   * rendering / batch paths against a pre-expanded tree. Production
   * callers MUST NOT pass it — they rely on the `GridNode` default
   * (D0: collapsed-by-default initial state) so the document opens
   * with only the root chevron visible.
   */
  setTreeData(data: GridTreeNodeData, expandDepth?: number): void {
    this.root = expandDepth === undefined ? new GridNode(data) : new GridNode(data, expandDepth);
  }

  /** Get the root node */
  getRoot(): GridNode | null {
    return this.root;
  }

  /** Find a node by its nodeId */
  findNode(nodeId: string): GridNode | null {
    if (!this.root) {
      return null;
    }
    return this.findNodeRecursive(this.root, nodeId);
  }

  /** Clear the model */
  clear(): void {
    this.root = null;
  }

  private findNodeRecursive(node: GridNode, nodeId: string): GridNode | null {
    if (node.nodeId === nodeId) {
      return node;
    }
    for (const child of node.children) {
      const found = this.findNodeRecursive(child, nodeId);
      if (found) {
        return found;
      }
    }
    return null;
  }
}
