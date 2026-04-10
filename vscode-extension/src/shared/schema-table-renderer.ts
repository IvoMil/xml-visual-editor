/**
 * Shared schema table renderer — HTML structure and row builders.
 * CSS styles are in ./schema-table-styles.ts
 * JS scripts are in ./schema-table-scripts.ts
 */

export { getStyles } from './schema-table-styles';
export { getElementsScript } from './schema-table-scripts';

export interface TableRenderOptions {
  v2Mode?: boolean;
  showFilter?: boolean;
}

export interface RowBuilderState {
  rowIndex: number;
}

export interface ContentModelNode {
  name: string | null;
  node_type: string;
  min_occurs: number;
  max_occurs: number | 'unbounded';
  current_count: number;
  is_satisfied: boolean;
  is_exhausted: boolean;
  can_insert: boolean;
  active_branch?: string;
  type_name: string;
  documentation: string;
  children: ContentModelNode[];
  before_cursor?: boolean;
  cursor_adjacent?: boolean;
  is_wildcard?: boolean;
  namespace_constraint?: string;
}

function esc(s: string | undefined | null): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Walk a compositor's children to find the first non-wildcard element name.
 * For sequence/all: returns the first child element name, recursing into child compositors.
 * For choice: returns the first element of the first alternative.
 */
export function getFirstInsertableElement(node: ContentModelNode): string | undefined {
  for (const child of node.children ?? []) {
    if (child.is_wildcard) continue;
    if (child.node_type === 'element') {
      if (child.name) return child.name;
    } else if (
      child.node_type === 'sequence' ||
      child.node_type === 'choice' ||
      child.node_type === 'all'
    ) {
      const found = getFirstInsertableElement(child);
      if (found) return found;
    }
  }
  return undefined;
}

export function getTableHtml(rows: string, options?: TableRenderOptions): string {
  const opts: Required<TableRenderOptions> = {
    v2Mode: options?.v2Mode ?? false,
    showFilter: options?.showFilter ?? false,
  };

  const filterBar = opts.showFilter
    ? '<div class="filter-bar" id="filterBar" style="display:none"><input id="filterInput" type="text" placeholder="Filter elements\u2026" oninput="filterRows(this.value)" /></div>\n'
    : '';

  return `${filterBar}
<table>
  <thead>
    <tr>
      <th class="col-name"><div class="col-name-inner"><span class="header-title">Schema Structure</span><span class="header-actions"><button class="header-btn" onclick="expandAll()" title="Expand All">&#x229E;</button><button class="header-btn" onclick="collapseAll()" title="Collapse All">&#x229F;</button></span></div></th>
      <th class="col-doc">Documentation</th>
      <th class="col-type">Type</th>
    </tr>
  </thead>
  <tbody id="tbody">
${rows}
  </tbody>
</table>`;
}

export function buildContentModelRows(
  entry: ContentModelNode,
  depth: number,
  state: RowBuilderState,
  collapseThreshold: number = 10,
  parentExpanded: boolean = true,
  activeBranchContext: string | undefined = undefined,
  focusedChild: string | undefined = undefined,
): string {
  if (!entry) {
    return '';
  }

  const children: ContentModelNode[] = entry.children ?? [];
  const hasChildren = children.length > 0;
  const nodeType: string = entry.node_type ?? 'element';
  const isCompositor = nodeType === 'choice' || nodeType === 'sequence' || nodeType === 'all';
  const isWildcard = entry.is_wildcard === true;

  const iconMap: Record<string, string> = {
    element: '&lt;&gt;',
    choice: '\u25C7',
    sequence: '\u25B7',
    all: '\u2295',
  };
  const icon = isWildcard ? '\u2298' : (iconMap[nodeType] ?? '\u2022');

  const name = entry.name ?? '';
  const displayName = isWildcard ? '(any)' : esc(isCompositor ? name || `(${nodeType})` : name);
  const doc = esc(entry.documentation ?? '');
  const typeName = esc(entry.type_name ?? '');

  // Cardinality chip
  const min: number = entry.min_occurs ?? 1;
  const max = entry.max_occurs ?? 1;
  const currentCount: number = entry.current_count ?? 0;
  let cardinalityChip = '';
  const maxDisplay = max === 'unbounded' ? '\u221E' : String(max);
  if (isCompositor) {
    // Always show cardinality for compositors — users need to know if required/optional
    if (min === 1 && max === 1) {
      cardinalityChip = `<span class="cardinality-chip">${min}..${maxDisplay} (required)</span>`;
    } else {
      const remaining = max === 'unbounded' ? '\u221E' : Math.max(0, Number(max) - currentCount);
      cardinalityChip = `<span class="cardinality-chip">${min}..${maxDisplay} (${remaining} left)</span>`;
    }
  } else if (!(min === 1 && max === 1)) {
    const remaining = max === 'unbounded' ? '\u221E' : Math.max(0, Number(max) - currentCount);
    cardinalityChip = `<span class="cardinality-chip">${min}..${maxDisplay} (${remaining} left)</span>`;
  }

  // Wildcard namespace badge
  let wildcardBadge = '';
  if (isWildcard && entry.namespace_constraint) {
    wildcardBadge = `<span class="compositor-badge">(${esc(entry.namespace_constraint)})</span>`;
  }

  // Compositor badge
  let compositorBadge = '';
  if (isCompositor) {
    const countLabel = hasChildren ? ` \u00B7 ${children.length}` : '';
    const activeBranchLabel =
      nodeType === 'choice' && entry.active_branch
        ? ` \u00B7 active: ${esc(entry.active_branch)}`
        : '';
    compositorBadge = `<span class="compositor-badge">(${nodeType}${countLabel}${activeBranchLabel})</span>`;
  }

  // Instance-state styling
  const isSatisfied = entry.is_satisfied !== false;
  const isExhausted = entry.is_exhausted === true;
  const canInsert = entry.can_insert === true;
  const ntClass = `nt-${nodeType}`;
  let nameClass = ntClass;
  if (!isSatisfied) {
    nameClass += ' unsatisfied';
  }
  if (min >= 1) {
    nameClass += ' required';
  }

  // Active/inactive branch styling
  let nameExtraClass = '';
  let activeBranchIndicator = '';
  if (activeBranchContext !== undefined && nodeType === 'element') {
    if (name === activeBranchContext) {
      activeBranchIndicator = '<span class="active-branch-indicator">\u2713</span>';
    } else {
      nameExtraClass = ' inactive-branch';
    }
  }

  let exhaustedIndicator = '';
  if (isExhausted && !activeBranchIndicator) {
    exhaustedIndicator =
      '<span class="exhausted-indicator" title="Maximum occurrences reached">\u2713</span>';
  } else if (currentCount > 0 && nodeType === 'element' && !activeBranchIndicator) {
    exhaustedIndicator =
      '<span class="present-indicator" title="Present in document (' +
      currentCount +
      ' instance' +
      (currentCount > 1 ? 's' : '') +
      ')">' +
      '\u2713</span>';
  }

  const focusedClass =
    focusedChild && nodeType === 'element' && name === focusedChild ? ' focused-child' : '';
  const exhaustedClass =
    isExhausted && entry.before_cursor === true && !entry.cursor_adjacent ? ' exhausted-row' : '';
  const beforeCursorClass = entry.before_cursor === true ? ' before-cursor' : '';
  const cursorAdjacentClass = entry.cursor_adjacent === true ? ' cursor-adjacent' : '';

  // Large choice groups collapsed by default
  const isLargeChoice = nodeType === 'choice' && children.length > collapseThreshold;

  const shouldExpand =
    (depth === 0 && !isLargeChoice) ||
    (depth > 0 && isCompositor && !isLargeChoice && (!isSatisfied || !!entry.active_branch));
  const arrowClass = hasChildren ? (shouldExpand ? 'arrow expanded' : 'arrow') : 'arrow leaf';
  const hiddenClass = !parentExpanded ? ' hidden-row' : '';

  // Insert action button
  // Show insert for: normal insertable elements, OR after-cursor elements that exist
  // in the document (exhausted globally but insertable from cursor position).
  // Never show insert for elements in inactive choice branches.
  const isInactiveBranch = nameExtraClass.includes('inactive-branch');
  const showElementInsert =
    nodeType === 'element' &&
    !isInactiveBranch &&
    !isWildcard &&
    (canInsert || entry.cursor_adjacent === true || (entry.before_cursor !== true && !isExhausted));

  // Compositor insert: resolve the first concrete element name
  let compositorInsertName: string | undefined;
  if (isCompositor && !isExhausted && canInsert) {
    compositorInsertName = getFirstInsertableElement(entry);
  }
  const showInsert = showElementInsert || !!compositorInsertName;

  const insertName = compositorInsertName ?? name;
  let insertBtn = '';
  if (showInsert) {
    const isCompositorBtn = !!compositorInsertName;
    insertBtn = `<button class="insert-action" onclick="insertElement('${esc(insertName)}', event${isCompositorBtn ? ', true' : ''})" title="Insert ${esc(insertName)}">Insert</button>`;
  }

  const rowId = state.rowIndex++;

  const wildcardClass = isWildcard ? ' wildcard-row' : '';

  let html = `    <tr class="schema-row${hiddenClass}${exhaustedClass}${beforeCursorClass}${cursorAdjacentClass}${focusedClass}${wildcardClass}" data-id="${rowId}" data-name="${esc(name)}" data-node-type="${nodeType}" data-can-insert="${canInsert}" data-depth="${depth}" data-has-children="${hasChildren}" onclick="selectRow(${rowId})">
      <td style="padding-left:${depth * 20 + 8}px">
        <span class="node-name">
          <span class="${arrowClass}" onclick="event.stopPropagation();toggleNode(${rowId})">\u25B6</span>
          <span class="icon ${ntClass}">${icon}</span>
          <span class="${nameClass}${nameExtraClass}">${displayName}</span>${activeBranchIndicator}${exhaustedIndicator}${wildcardBadge}${compositorBadge}${cardinalityChip}${insertBtn}
        </span>
      </td>
      <td class="cell-doc col-doc" title="${doc}">${doc}</td>
      <td class="cell-type col-type">${typeName}</td>
    </tr>\n`;

  for (const child of children) {
    const childActiveBranch =
      nodeType === 'choice' && entry.active_branch && entry.max_occurs === 1
        ? String(entry.active_branch)
        : undefined;
    html += buildContentModelRows(
      child,
      depth + 1,
      state,
      collapseThreshold,
      shouldExpand,
      childActiveBranch,
      focusedChild,
    );
  }
  return html;
}
