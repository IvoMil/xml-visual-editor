import { GridNode } from '../model/grid-node';

/** A contiguous segment of children within a parent element.
 *
 *  - `table`   : a maximal contiguous run of element children with the same
 *                `name` and the same `siblingCount > 1`. Rendered as ONE
 *                table region.
 *  - `unique`  : a single element child that is not part of a multi-element
 *                run (singleton or `siblingCount === 1`). Rendered as a tree
 *                node.
 *  - `comment` : a comment pseudo-child. Always its own segment — comments
 *                terminate the surrounding run.
 *
 *  The grouping rule (Round B contiguous-run semantics, mandated by the
 *  engine's per-run `siblingIndex` / `siblingCount`):
 *
 *    > A contiguous block of children where each is `type === "element"`
 *    > AND has the same `name` AND the same `siblingCount > 1` AND no
 *    > non-element child interrupts the run forms ONE table region.
 *    > Comments and singletons break the run.
 *
 *  Example input children (document order):
 *    a(1/3), a(2/3), a(3/3), comment, a(1/2), a(2/2)
 *  yields:
 *    [table a×3, comment, table a×2]
 */
export type ChildSegment =
  | { kind: 'table'; groupName: string; nodes: GridNode[] }
  | { kind: 'unique'; node: GridNode }
  | { kind: 'comment'; node: GridNode };

/** Group an ordered list of children into contiguous segments per the
 *  rule documented on `ChildSegment`. */
export function groupChildSegments(children: readonly GridNode[]): ChildSegment[] {
  const segments: ChildSegment[] = [];
  let i = 0;
  while (i < children.length) {
    const c = children[i];
    if (c.type === 'comment') {
      segments.push({ kind: 'comment', node: c });
      i++;
      continue;
    }
    // Element. If it claims to be part of a multi-element run, consume the
    // maximal contiguous run of same-name same-siblingCount elements.
    if (c.siblingCount > 1) {
      let j = i + 1;
      while (j < children.length) {
        const n = children[j];
        if (n.type !== 'element') break;
        if (n.name !== c.name) break;
        if (n.siblingCount !== c.siblingCount) break;
        j++;
      }
      const run = children.slice(i, j);
      if (run.length >= 2) {
        segments.push({ kind: 'table', groupName: c.name, nodes: run });
      } else {
        // Defensive: a run of length 1 even though siblingCount>1 (e.g. the
        // run was interrupted immediately) — render as a unique tree node.
        segments.push({ kind: 'unique', node: c });
      }
      i = j;
    } else {
      segments.push({ kind: 'unique', node: c });
      i++;
    }
  }
  return segments;
}
