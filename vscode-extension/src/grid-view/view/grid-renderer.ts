import { GridModel } from '../model/grid-model';
import { GridNode } from '../model/grid-node';
import { GridNodeAttribute } from '../grid-view-types';
import { GridSelectionModel } from '../model/grid-selection';
import { ToggleState } from '../model/toggle-state';
import { computeGridCols } from './compute-grid-cols';
import { emitCommentRow } from './emit-comment-row';
import { emitTableRegion } from './emit-table-region';
import { injectTableModeOffIcon } from './emit-off-icon-inject';
import { groupChildSegments } from './group-table-runs';

/** Renders the grid model as a flat row list under a single CSS Grid root */
export class GridRenderer {
  /** Optional session-scoped toggle state. Absent ⇒ engine defaults
   *  apply (table-mode ON for every table candidate, flip OFF). */
  private toggleState: ToggleState | undefined;

  /** Optional axis-aware selection snapshot, used to stamp `.selected`
   *  / `.column-selected` onto table-region cells at emit time. Absent
   *  ⇒ emitters skip axis-aware class stamping (legacy runtime
   *  `applySelection` still handles row-axis highlighting on
   *  `.g-row[data-node-id]` after the DOM is live). */
  private selection: GridSelectionModel | undefined;

  setToggleState(ts: ToggleState | undefined): void {
    this.toggleState = ts;
  }

  setSelection(sel: GridSelectionModel | undefined): void {
    this.selection = sel;
  }

  /** Effective table-mode for a parent (engine default ON). */
  private isTableModeOn(parent: GridNode): boolean {
    if (!this.toggleState) return true;
    return this.toggleState.isTableModeOn(parent.nodeId, true);
  }

  private isFlipped(parent: GridNode): boolean {
    return this.toggleState ? this.toggleState.isFlipped(parent.nodeId) : false;
  }

  /** Resolve the effective table-mode for a single run. Prefers an
   *  override stored under the per-run toggle key; falls back to an
   *  override stored under the owning parent's key (so a test or host
   *  that toggles the whole parent still affects every run); else
   *  returns the engine default. */
  private resolveTableMode(toggleKey: string, parentKey: string, engineDefault: boolean): boolean {
    if (!this.toggleState) return engineDefault;
    const own = this.toggleState.peekTableMode(toggleKey);
    if (own !== undefined) return own;
    if (toggleKey !== parentKey) {
      const parentVal = this.toggleState.peekTableMode(parentKey);
      if (parentVal !== undefined) return parentVal;
    }
    return engineDefault;
  }

  /** Resolve the effective flip flag for a single run with the same
   *  fallback cascade as `resolveTableMode`. */
  private resolveFlipped(toggleKey: string, parentKey: string): boolean {
    if (!this.toggleState) return false;
    const own = this.toggleState.peekFlipped(toggleKey);
    if (own !== undefined) return own;
    if (toggleKey !== parentKey) {
      const parentVal = this.toggleState.peekFlipped(parentKey);
      if (parentVal !== undefined) return parentVal;
    }
    return false;
  }

  /** Render the full tree as an HTML string */
  render(model: GridModel): string {
    const root = model.getRoot();
    if (!root) {
      return '<div class="grid-empty">No XML data to display</div>';
    }
    const totalCols = computeGridCols(root, {
      isTableModeOn: (p) => this.isTableModeOn(p),
      isFlipped: (p) => this.isFlipped(p),
    });
    const rows: string[] = [];
    // Pre-root comments at depth 0, above the root row.
    for (const c of root.preRootComments) emitCommentRow(c, 0, rows);
    this.emitNode(root, 0, rows);
    // Post-root comments at depth 0, below the root subtree.
    for (const c of root.postRootComments) emitCommentRow(c, 0, rows);
    const gtc = `repeat(${totalCols}, max-content) 1fr`;
    return (
      `<div class="grid-root" role="tree" style="grid-template-columns: ${gtc};">` +
      rows.join('') +
      '</div>'
    );
  }

  /** Emit D empty indent cells at grid-columns 1/2, 2/3, …, D/(D+1).
   *  Combined with `column-gap: 1px` on `.grid-root` (border-coloured
   *  background showing through), these produce one visible vertical line
   *  per global grid boundary — always aligned with the actual column
   *  tracks regardless of their auto-sized width.
   */
  private indentCells(depth: number): string {
    let html = '';
    for (let k = 1; k <= depth; k++) {
      // `data-ancestor-expanded="1"` on every visible indent cell: a row at
      // depth D is only emitted because every ancestor at depths 0..D-1 is
      // expanded. CSS uses this attribute to draw the tree guide.
      html += `<span class="g-indent" data-ancestor-expanded="1" style="grid-column: ${k} / ${k + 1};"></span>`;
    }
    return html;
  }

  /** Emit a single flat row with name and value cells.
   *  `valueEditable` marks the value cell as editable data (applies
   *  the `g-editable` class) so CSS can shade it differently from
   *  structural/read-only cells. Name cells, indent cells and summary
   *  value cells are always structural and never receive the class.
   */
  private emitRow(
    rows: string[],
    rowClass: string,
    nodeId: string,
    nodeType: string,
    depth: number,
    nameHtml: string,
    valueHtml: string,
    extraAttrs = '',
    isNonLeaf = false,
    valueEditable = false,
  ): void {
    // Placement:
    //   Non-leaf at D    : name (D+1)/-1     (full remaining width, no value cell)
    //   Leaf/attr at D   : name (D+1)/(D+2)  value (D+2)/-1
    const nameGridCol = isNonLeaf ? `${depth + 1} / -1` : `${depth + 1} / ${depth + 2}`;
    const valueGridCol = `${depth + 2} / -1`;
    const valueClass = valueEditable ? 'g-cell c-value g-editable' : 'g-cell c-value';
    rows.push(
      `<div class="g-row ${rowClass} d-${depth}"` +
      ` data-node-id="${this.escapeAttr(nodeId)}"` +
      ` data-node-type="${nodeType}"` +
      ` data-depth="${depth}"` +
      ` style="--depth: ${depth}"${extraAttrs}>` +
      this.indentCells(depth) +
      `<span class="g-cell c-name" style="grid-column: ${nameGridCol};">${nameHtml}</span>` +
      (isNonLeaf
        ? ''
        : `<span class="${valueClass}" style="grid-column: ${valueGridCol};">${valueHtml}</span>`) +
      '</div>',
    );
  }

  /** True iff this node has something to show when expanded */
  private canExpand(node: GridNode): boolean {
    return node.hasChildren || node.isTableLike || node.hasAttributes;
  }

  /** True iff the element has attributes AND a text value AND no element children.
   *  When expanded, the text value is rendered as a separate "text" child row
   *  AFTER the attribute rows — matching XMLSpy's treatment of mixed content.
   */
  private hasSeparateTextValueRow(node: GridNode): boolean {
    return node.hasAttributes && !node.hasChildren && !node.isTableLike && !!node.value;
  }

  /** Emit a tree node header row and recursively emit its children.
   *
   *  `bodyDepthShift` bumps the depth of THIS node's body (attributes,
   *  children, text row) by the given amount while leaving the header
   *  row at `depth`. Used by the tree-ladder branch of a hybrid
   *  candidate parent to indent every run member's subtree one extra
   *  step to the right of the member itself, so the gutter column
   *  carrying the table-mode-OFF icon reads as a real indent level.
   *  Default `0` preserves normal tree rendering for every other call
   *  site. */
  private emitNode(
    node: GridNode,
    depth: number,
    rows: string[],
    bodyDepthShift = 0,
  ): void {
    const expandable = this.canExpand(node);
    const toggle = expandable
      ? `<span class="expand-toggle" data-node-id="${this.escapeAttr(node.nodeId)}"` +
        ` data-expanded="${node.isExpanded}">${node.isExpanded ? '▼' : '▶'}</span>`
      : '<span class="expand-spacer"></span>';

    const numberHtml =
      node.siblingCount > 1
        ? ` <span class="sibling-index">&lt;${node.siblingIndex}&gt;</span>`
        : '';

    const countHtml = node.isTableLike
      ? ` <span class="child-count">(${node.childCount})</span>`
      : '';

    const nameContent =
      toggle +
      '<span class="node-icon element-icon">&lt;&gt;</span>' +
      `<span class="node-name">${this.escapeHtml(node.name)}</span>` +
      numberHtml +
      countHtml;

    // Element with attributes AND a text value (no element children): when
    // expanded, the value is rendered as a separate child row, not inline.
    // When collapsed, render an XMLSpy-style summary in the value cell so
    // that `<intData allowAdjust="false" maxVal="500" minVal="3">96</intData>`
    // appears as  `allowAdjust="false" maxVal="500" minVal="3" 96`.
    const separateValueRow = this.hasSeparateTextValueRow(node);
    let valueContent = '';
    let valueEditable = false;
    if (separateValueRow && !node.isExpanded) {
      // Collapsed mixed-content summary — structural, not a single editable field.
      valueContent = this.mixedContentSummary(node);
    } else if (
      !node.isExpanded &&
      node.hasAttributes &&
      !node.hasChildren &&
      !node.isTableCandidate
    ) {
      // Attribute-only element collapsed: show attr summary in value column.
      valueContent = this.mixedContentSummary(node);
    } else if (node.value && !(separateValueRow && node.isExpanded)) {
      valueContent = `<span class="node-value">${this.escapeHtml(node.value)}</span>`;
      valueEditable = true;
    }

    const isNonLeaf = node.hasChildren || node.isTableLike;

    const ariaAttrs = expandable
      ? ` role="treeitem" aria-level="${depth + 1}" aria-expanded="${node.isExpanded}"`
      : ` role="treeitem" aria-level="${depth + 1}"`;

    this.emitRow(rows, 'r-tree', node.nodeId, 'element', depth, nameContent, valueContent, ariaAttrs, isNonLeaf, valueEditable);

    // Nothing below the header unless it is expanded. This is what gives
    // attribute-only elements (e.g. <regular locationId="a"/>) a proper
    // collapsible chevron: when collapsed, their attributes are hidden.
    if (!node.isExpanded) return;

    const childDepth = depth + 1 + bodyDepthShift;

    if (node.isTableLike) {
      this.emitAttributes(node.attributes, node.nodeId, childDepth, rows);
      this.emitSegmentedChildren(node, childDepth, rows);
    } else {
      this.emitAttributes(node.attributes, node.nodeId, childDepth, rows);
      this.emitChildNodes(node.children, childDepth, rows);
      if (separateValueRow) {
        this.emitTextValueRow(node, childDepth, rows);
      }
    }
  }

  /** Emit a standalone "text content" child row for elements that mix
   *  attributes with a text value (rendered when the element is expanded).
   */
  private emitTextValueRow(node: GridNode, depth: number, rows: string[]): void {
    const textNodeId = `${node.nodeId}/#text`;
    const nameContent =
      '<span class="expand-spacer"></span>' +
      '<span class="node-icon text-icon">Abc</span>';
    this.emitRow(
      rows, 'r-text', textNodeId, 'text', depth, nameContent,
      this.escapeHtml(node.value), '', false, true,
    );
  }

  /** Render an XMLSpy-style inline summary of an element's attributes and,
   *  optionally, its text value. Used in the value cell of a collapsed
   *  element that has attributes (and possibly mixed text content).
   */
  private mixedContentSummary(node: GridNode): string {
    const parts: string[] = [];
    for (const a of node.attributes) {
      parts.push(
        '<span class="ms-attr">' +
          `<span class="ms-attr-name">${this.escapeHtml(a.name)}</span>` +
          '<span class="ms-attr-eq">=</span>' +
          `<span class="ms-attr-value">&quot;${this.escapeHtml(a.value)}&quot;</span>` +
          '</span>',
      );
    }
    if (node.value) {
      parts.push(`<span class="ms-text">${this.escapeHtml(node.value)}</span>`);
    }
    return `<span class="mixed-summary">${parts.join('')}</span>`;
  }

  /** Emit attribute rows as flat name|value rows */
  private emitAttributes(
    attrs: readonly GridNodeAttribute[],
    parentNodeId: string,
    depth: number,
    rows: string[],
  ): void {
    for (const attr of attrs) {
      const attrNodeId = `${parentNodeId}/@${attr.name}`;
      const nameContent =
        '<span class="expand-spacer"></span>' +
        '<span class="node-icon attribute-icon">=</span>' +
        `<span class="node-name attr-name">${this.escapeHtml(attr.name)}</span>`;
      this.emitRow(
        rows, 'r-attr', attrNodeId, 'attribute', depth, nameContent,
        this.escapeHtml(attr.value), '', false, true,
      );
    }
  }

  /** Emit child nodes — route complex children to emitNode, leaves to emitLeafElement */
  private emitChildNodes(children: readonly GridNode[], depth: number, rows: string[]): void {
    for (const child of children) {
      if (child.type === 'comment') { emitCommentRow(child, depth, rows); continue; }
      if (child.hasChildren || child.hasAttributes || child.isTableLike) {
        this.emitNode(child, depth, rows);
      } else {
        this.emitLeafElement(child, depth, rows);
      }
    }
  }

  /** Emit a leaf element as a flat name|value row */
  private emitLeafElement(child: GridNode, depth: number, rows: string[]): void {
    const toggle = this.canExpand(child)
      ? `<span class="expand-toggle" data-node-id="${this.escapeAttr(child.nodeId)}"` +
        ` data-expanded="${child.isExpanded}">${child.isExpanded ? '▼' : '▶'}</span>`
      : '<span class="expand-spacer"></span>';

    const numberHtml =
      child.siblingCount > 1
        ? ` <span class="sibling-index">&lt;${child.siblingIndex}&gt;</span>`
        : '';

    const countHtml = child.isTableLike
      ? ` <span class="child-count">(${child.childCount})</span>`
      : '';

    const nameContent =
      toggle +
      '<span class="node-icon element-icon">&lt;&gt;</span>' +
      `<span class="node-name">${this.escapeHtml(child.name)}</span>` +
      numberHtml +
      countHtml;

    const valueContent = child.value ? this.escapeHtml(child.value) : '';
    this.emitRow(
      rows, 'r-elem', child.nodeId, 'element', depth, nameContent, valueContent,
      '', false, true,
    );
  }

  /** Emit children of a table candidate — uses contiguous-run grouping so a
   *  same-name run interrupted by a comment (or by a sibling-count change)
   *  produces multiple separate table regions.
   *
   *  Each table segment carries an INDEPENDENT table-mode + flip toggle.
   *  When a parent contains a single run the toggle key collapses to the
   *  parent's own nodeId (preserving behaviour of tests and hosts that
   *  toggle the whole parent). When a parent contains multiple runs each
   *  run receives a per-run toggle key `${firstMember.nodeId}#group` so
   *  clicks on one run's toggle strip do not flip the siblings. */
  private emitSegmentedChildren(parent: GridNode, depth: number, rows: string[]): void {
    const segments = groupChildSegments(parent.children);
    const tableSegmentCount = segments.filter((s) => s.kind === 'table').length;
    const multiRun = tableSegmentCount > 1;

    let uniqueBatch: GridNode[] = [];
    const flushUniques = (): void => {
      if (uniqueBatch.length === 0) return;
      this.emitChildNodes(uniqueBatch, depth, rows);
      uniqueBatch = [];
    };

    for (const seg of segments) {
      if (seg.kind === 'comment') {
        flushUniques();
        emitCommentRow(seg.node, depth, rows);
        continue;
      }
      if (seg.kind === 'unique') {
        uniqueBatch.push(seg.node);
        continue;
      }
      flushUniques();
      const groupNodeId = seg.nodes[0].nodeId + '#group';
      const toggleKey = multiRun ? groupNodeId : parent.nodeId;
      const tableOn = this.resolveTableMode(toggleKey, parent.nodeId, true);
      const flipped = this.resolveFlipped(toggleKey, parent.nodeId);

      if (tableOn) {
        const isGroupExpanded = seg.nodes[0].isExpanded;
        const toggleHtml =
          `<span class="expand-toggle" data-node-id="${this.escapeAttr(groupNodeId)}"` +
          ` data-expanded="${isGroupExpanded}">${isGroupExpanded ? '▼' : '▶'}</span>`;
        const nameContent =
          toggleHtml +
          '<span class="node-icon element-icon">&lt;&gt;</span>' +
          `<span class="node-name">${this.escapeHtml(seg.groupName)}</span>` +
          ` <span class="child-count">(${seg.nodes.length})</span>`;
        this.emitRow(rows, 'r-tregion-label', groupNodeId, 'element', depth, nameContent, '', '', true);
        if (isGroupExpanded) {
          emitTableRegion(
            seg.nodes,
            depth,
            rows,
            (h, gc, pr, cid, r) => this.emitDrillBox(h, gc, pr, cid, r),
            flipped,
            parent.nodeId,
            this.selection,
            parent.tableRuns,
            toggleKey,
            this.toggleState,
          );
        }
      } else {
        // Tree-ladder: emit the run members as tree nodes and inject
        // the table-mode-OFF icon onto the first body row of the
        // first member. The injection is scoped to THIS run's rows
        // only so sibling runs under the same parent paint their own
        // icons independently.
        const firstRowIdx = rows.length;
        for (const member of seg.nodes) {
          if (member.hasChildren || member.hasAttributes || member.isTableLike) {
            this.emitNode(member, depth, rows, 0);
          } else {
            this.emitLeafElement(member, depth, rows);
          }
        }
        injectTableModeOffIcon(rows, firstRowIdx, toggleKey, depth);
      }
    }
    flushUniques();
  }

  /** Render the body (attributes + children) of a node at the given depth
   *  directly into a containing grid. Used by `emitDrillBox` to render a
   *  chevron host's subtree inside a self-contained drill-box grid item.
   *  The node's own header row is NOT emitted — the header is already
   *  present as the enclosing table data row's chevron cell.
   *
   *  Always uses segmented children so same-name runs render as
   *  hybrid/scalar tables even when the host itself isn't flagged as
   *  table-like by the engine (e.g. a `<meta>` element whose children
   *  happen to form a same-name run). */
  public emitSubtreeBody(node: GridNode, depth: number, rows: string[]): void {
    this.emitAttributes(node.attributes, node.nodeId, depth, rows);
    this.emitSegmentedChildren(node, depth, rows);
  }

  /** Render a self-contained drill-box as ONE grid item under the
   *  outer `.grid-root`. The wrapper carries its own `display: grid`
   *  template (computed from the host's subtree) and contains the full
   *  subtree body rendered by `emitSubtreeBody(host, 0, ...)`.
   *
   *  Layout:
   *    * The wrapper lives at the given outer `gridColumn` track so
   *      the drill-box stays bounded to the owning chevron's column.
   *    * Inner rows (`display: contents` via `.g-row`) drop their cells
   *      into the wrapper's own grid — depth accounting starts at 0 so
   *      the wrapper's template only needs to accommodate what the
   *      subtree itself emits.
   *    * The wrapper carries `data-cell-column-id="${hostColumnId}"`
   *      so column-axis paint stamps `.column-selected` on the wrapper
   *      (the CSS descendant rule then paints the rows inside).
   *    * The wrapper carries `data-parent-row-id="${parentRowId}"` so
   *      scanners can follow a drill-box back to its owning row.
   *
   *  Appends exactly one string to `outerRows`. */
  public emitDrillBox(
    host: GridNode,
    gridColumn: string,
    parentRowId: string,
    hostColumnId: string,
    outerRows: string[],
  ): void {
    const innerRows: string[] = [];
    this.emitSubtreeBody(host, 0, innerRows);
    const innerCols = computeGridCols(host, {
      isTableModeOn: (p) => this.isTableModeOn(p),
      isFlipped: (p) => this.isFlipped(p),
    });
    const gtc = `repeat(${innerCols}, max-content) 1fr`;
    const cidAttr = hostColumnId
      ? ` data-cell-column-id="${this.escapeAttr(hostColumnId)}"`
      : '';
    const prAttr = parentRowId
      ? ` data-parent-row-id="${this.escapeAttr(parentRowId)}"`
      : '';
    outerRows.push(
      `<div class="g-drill-box"${cidAttr}${prAttr}` +
        ` style="grid-column: ${gridColumn}; display: grid;` +
        ` grid-template-columns: ${gtc}; column-gap: 1px;">` +
        innerRows.join('') +
        '</div>',
    );
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeAttr(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}
