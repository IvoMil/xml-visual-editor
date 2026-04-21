/** Attribute data from C++ engine */
export interface GridNodeAttribute {
  name: string;
  value: string;
}

/** Per-run union-shape column descriptor emitted by the engine on every
 *  parent element. One entry per distinct child-tag run that qualifies
 *  as a hybrid/table candidate. `attrUnion` and `childUnion` list the
 *  attribute names and element-child names seen across the run members,
 *  in first-appearance order, deduped. */
export interface GridTableRunUnion {
  tag: string;
  attrUnion: string[];
  childUnion: string[];
}

/** Tree node data from C++ engine (matches gridView.getTreeData response) */
export interface GridTreeNodeData {
  nodeId: string;
  name: string;
  /** 'element' for regular elements; 'comment' for synthetic comment
   *  pseudo-children emitted by the engine. */
  type: 'element' | 'comment';
  value: string;
  line: number;
  column: number;
  childCount: number;
  isTableCandidate: boolean;
  /** Engine flag: set on every member of a same-tag repeated-sibling run
   *  whose members collectively qualify as a hybrid table (union-shape
   *  rule). A superset of the legacy scalar-only `isTableCandidate`.
   *  Optional for backwards compatibility with older engine binaries. */
  isHybridTableCandidate?: boolean;
  siblingIndex: number;
  siblingCount: number;
  attributes: GridNodeAttribute[];
  children: GridTreeNodeData[];
  /** Per-run union column descriptors for every hybrid-candidate run
   *  owned by this parent. Empty on non-candidate parents. Look up a
   *  run by tag: `tableRuns.find(r => r.tag === childName)`. */
  tableRuns?: GridTableRunUnion[];
  /** Top-level only: comment children of the document that appear before
   *  the root element. The engine populates this only on the root node;
   *  it is always absent (or empty) on nested nodes. */
  preRootComments?: GridTreeNodeData[];
  /** Top-level only: comment children of the document that appear after
   *  the root element. The engine populates this only on the root node;
   *  it is always absent (or empty) on nested nodes. */
  postRootComments?: GridTreeNodeData[];
}

/** Messages from extension host → webview */
export interface UpdateTreeDataMessage {
  type: 'updateTreeData';
  data: GridTreeNodeData;
}

/** Messages from webview → extension host */
export interface GridViewMessage {
  type: string;
}

/** Webview → host: toggle expand/collapse of a node */
export interface ToggleExpandMessage {
  type: 'toggleExpand';
  nodeId: string;
}

/** Webview → host: node was selected */
export interface NodeSelectedMessage {
  type: 'nodeSelected';
  nodeId: string;
  nodeType: string;
}

/** Webview → host: batch expand/collapse for multi-row selection.
 *
 * `direction === '+'` expands every collapsed expandable id in the list.
 * `direction === '-'` collapses every expanded id in the list.
 * All other ids (leaves, comments, wrong-direction) are silently skipped
 * (direction-guarded). The webview sends every id in the selection
 * regardless of DOM visibility; the host filters using engine-owned
 * `GridNode.isExpanded` state so that hidden descendants of collapsed
 * ancestors still flip.
 */
export interface BatchToggleExpandMessage {
  type: 'batchToggleExpand';
  direction: '+' | '-';
  nodeIds: string[];
}

/** Webview → host: session-only toggle state change for a parent
 *  element. Host updates its ToggleState and re-renders from the
 *  existing in-memory GridModel (no engine fetch). */
export interface ToggleStateChangedMessage {
  type: 'toggleStateChanged';
  parentNodeId: string;
  kind: 'tableMode' | 'flip';
  value: boolean;
}

/** Union of all webview → host messages */
export type WebviewToHostMessage =
  | ToggleExpandMessage
  | NodeSelectedMessage
  | BatchToggleExpandMessage
  | ToggleStateChangedMessage;
