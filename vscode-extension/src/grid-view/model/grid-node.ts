import { GridTreeNodeData, GridNodeAttribute, GridTableRunUnion } from '../grid-view-types';

/** A node in the grid view tree. Wraps engine data with UI state. */
export class GridNode {
  readonly nodeId: string;
  readonly name: string;
  /** 'element' for regular elements, 'comment' for comment pseudo-nodes. */
  readonly type: 'element' | 'comment';
  readonly value: string;
  readonly line: number;
  readonly attributes: readonly GridNodeAttribute[];
  readonly children: GridNode[];
  readonly childCount: number;
  readonly isTableCandidate: boolean;
  /** Mirrors the engine's `isHybridTableCandidate` flag. Defaults to
   *  `false` for older engine binaries that do not emit the field. */
  readonly isHybridTableCandidate: boolean;
  readonly siblingIndex: number;
  readonly siblingCount: number;
  /** Per-run union-shape column descriptors from the engine. Empty on
   *  non-candidate parents. */
  readonly tableRuns: readonly GridTableRunUnion[];
  /** Top-level only: comments before/after the root element. Empty arrays
   *  on every non-root node (engine guarantee). */
  readonly preRootComments: readonly GridNode[];
  readonly postRootComments: readonly GridNode[];

  /** UI state — not from engine */
  isExpanded: boolean;

  /**
   * Build a GridNode tree from engine data.
   *
   * `expandDepth` controls how many initial levels render as expanded:
   *  - `0` (default, D0 — collapsed-by-default initial state): every
   *    node starts collapsed. The first `setTreeData` from the engine
   *    produces a tree where only the root row is visible with a
   *    chevron; the user drives all expansion via `+` / chevron click.
   *  - `> 0`: legacy depth-bounded opt-in used by tests that need to
   *    exercise rendering / batch paths against a pre-expanded tree.
   *    A node is initially expanded iff `expandDepth > 0` AND it has
   *    renderable content (child elements OR attributes).
   *
   * Table-candidate children always start collapsed regardless of
   * `expandDepth`; they render as table rows, not tree rows.
   */
  constructor(data: GridTreeNodeData, expandDepth = 0) {
    this.nodeId = data.nodeId;
    this.name = data.name;
    this.type = data.type ?? 'element';
    this.value = data.value;
    this.line = data.line;
    this.attributes = data.attributes;
    this.childCount = data.childCount;
    this.isTableCandidate = data.isTableCandidate;
    this.isHybridTableCandidate = data.isHybridTableCandidate ?? false;
    this.siblingIndex = data.siblingIndex;
    this.siblingCount = data.siblingCount;
    this.tableRuns = data.tableRuns ?? [];
    // A node starts expanded when it has any renderable content to hide
    // (child elements OR attributes). Attribute-only elements are therefore
    // open by default but can be collapsed via their chevron.
    const hasContent = data.children.length > 0 || data.attributes.length > 0;
    this.isExpanded = expandDepth > 0 && hasContent;
    // Table candidate children start collapsed — they render as table rows, not tree nodes
    const childDepth = this.isTableCandidate ? 0 : Math.max(0, expandDepth - 1);
    this.children = data.children.map((child) => new GridNode(child, childDepth));
    // Pre/post-root comment lists (only meaningful at root; engine returns
    // them empty/absent on nested nodes). Built with `expandDepth = 0`
    // because comments are leaves with no children of their own.
    this.preRootComments = (data.preRootComments ?? []).map((c) => new GridNode(c, 0));
    this.postRootComments = (data.postRootComments ?? []).map((c) => new GridNode(c, 0));
  }

  /** Whether this node has child elements */
  get hasChildren(): boolean {
    return this.children.length > 0;
  }

  /** Whether this node has attributes */
  get hasAttributes(): boolean {
    return this.attributes.length > 0;
  }

  /** True iff the engine flagged this node as either a pure (scalar-only)
   *  OR a hybrid (same-shape) table candidate. The renderer uses this
   *  to decide whether to dispatch into the table rendering path, while
   *  internal engine-level checks keep using `isTableCandidate` directly
   *  to preserve the pure/hybrid distinction. */
  get isTableLike(): boolean {
    return this.isTableCandidate || this.isHybridTableCandidate;
  }

  /** Toggle expand/collapse */
  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }
}
