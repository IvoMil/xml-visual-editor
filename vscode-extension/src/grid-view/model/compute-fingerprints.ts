/**
 * Per-nodeId content fingerprints for the selection reconcile.
 *
 * The host computes fingerprints for every renderable id in the current
 * tree after each rebuild. `GridSelectionModel.reconcileWithFingerprints`
 * compares each surviving selection id's stored fingerprint (captured
 * when the id was added to the selection) against the freshly-computed
 * value. Ids whose path still exists but whose content changed are
 * dropped — avoiding the "path-preserved but pointing at a different
 * sibling" failure mode.
 *
 * Fingerprint format (stable across platforms):
 *   element   → `<localName>|<attrKvDigest>|<textValue>`
 *   attribute → `@<attrName>|<value>`  (the owning element's fp already
 *               anchors identity via attrs+text; attr row gets its own
 *               fp so attribute-value edits invalidate its selection)
 *   #text     → `#text|<value>`
 *   comment   → `#comment|<value>`
 *
 * `attrKvDigest` is the attributes sorted by name and concatenated as
 * `name=value;` — stable, no hashing required (xml attribute namespaces
 * are already normalised by the engine).
 *
 * IMPORTANT: siblingIndex is deliberately OMITTED so the reverse-index
 * remap in `reconcileWithFingerprints` can map `row[4]` (pre-delete) to
 * `row[3]` (post-delete) when the content is the same. If two sibling
 * elements have identical name+attrs+text their fingerprints collide;
 * the remap then collapses them to a single fresh id — a documented,
 * accepted behaviour.
 */
import { GridModel } from './grid-model';
import { GridNode } from './grid-node';

export function computeFingerprints(model: GridModel): Map<string, string> {
  const out = new Map<string, string>();
  const root = model.getRoot();
  if (!root) return out;
  for (const c of root.preRootComments) {
    out.set(c.nodeId, commentFp(c));
  }
  walk(root, out);
  for (const c of root.postRootComments) {
    out.set(c.nodeId, commentFp(c));
  }
  return out;
}

function walk(node: GridNode, out: Map<string, string>): void {
  out.set(node.nodeId, nodeFp(node));
  if (node.type === 'comment') return;

  for (const attr of node.attributes) {
    const attrId = `${node.nodeId}/@${attr.name}`;
    out.set(attrId, `@${attr.name}|${attr.value}`);
  }
  const hasSeparateTextValueRow =
    node.attributes.length > 0 &&
    node.children.length === 0 &&
    !node.isTableLike &&
    !!node.value;
  if (hasSeparateTextValueRow) {
    out.set(`${node.nodeId}/#text`, `#text|${node.value}`);
  }

  for (const child of node.children) {
    walk(child, out);
  }
}

function nodeFp(n: GridNode): string {
  if (n.type === 'comment') return commentFp(n);
  const attrs = [...n.attributes]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((a) => `${a.name}=${a.value}`)
    .join(';');
  const text = n.value ?? '';
  return `${n.name}|${attrs}|${text}`;
}

function commentFp(n: GridNode): string {
  return `#comment|${n.value}`;
}
