/**
 * XML Cursor Parser — types and helper functions for cursor context detection.
 */

/**
 * One of nine cursor contexts (A–I) describing what the cursor sits on.
 *
 * - **A** — Start-tag name (`<elem|ent`)
 * - **B** — Start-tag post-name gap (`<element |>`)
 * - **C** — Attribute name (`<element na|me="..."`)
 * - **D** — Attribute value (`<element name="|val"`)
 * - **E** — Empty element content (between tags, no children)
 * - **F** — Between child elements
 * - **G** — End-tag name (`</elem|ent>`)
 * - **H** — Text node content
 * - **I** — Outside the root element
 */
export type CursorContextType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

/** Information about the XML element at the cursor position. */
export interface CursorElementInfo {
  /** Local name of the element containing the cursor, or null if outside. */
  elementName: string | null;
  /** Path from root to current element (e.g. ['root', 'child', 'grandchild']). */
  elementPath: string[];
  /** One of the nine cursor contexts A–I. */
  cursorContext: CursorContextType;
  /** Attribute name when cursor is in an attribute name or value (contexts C, D). */
  currentAttribute: string | null;
  /** Name of last closed direct child element before cursor (context F only). */
  precedingSiblingName: string | null;
  /** Simple XPath without predicates, e.g., "/root/parent/child" */
  simpleXPath: string;
  /** XPath with positional predicates, e.g., "/root[1]/parent[1]/child[2]" */
  xpathWithPredicates: string;
}

export interface StackEntry {
  name: string;
  startOffset: number;
  hasChildElements: boolean;
  hasText: boolean;
  siblingIndex: number;
  childNameCounts: Map<string, number>;
  lastClosedChildName: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function skipComment(text: string, from: number): number {
  const end = text.indexOf('-->', from);
  return end === -1 ? text.length : end + 3;
}

export function skipCdata(text: string, from: number): number {
  const end = text.indexOf(']]>', from);
  return end === -1 ? text.length : end + 3;
}

export function skipPI(text: string, from: number): number {
  const end = text.indexOf('?>', from);
  return end === -1 ? text.length : end + 2;
}

export function isNameChar(ch: string): boolean {
  // Simplified XML name char: letters, digits, -, _, ., :
  return /[\w.\-:]/.test(ch);
}

/**
 * Parse the tag name starting at `pos` (the character right after `<` or `</`).
 * Returns the name and the index right after the last character of the name.
 */
export function parseTagName(text: string, pos: number): { name: string; end: number } {
  let i = pos;
  while (i < text.length && isNameChar(text[i])) {
    i++;
  }
  return { name: text.slice(pos, i), end: i };
}

/**
 * Find the closing `>` of a tag that starts at `tagStart` (the `<` position).
 * Handles quoted attribute values so `>` inside quotes is ignored.
 */
export function findTagEnd(text: string, tagStart: number): number {
  let i = tagStart + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < text.length && text[i] !== quote) {
        i++;
      }
      // skip closing quote
      i++;
      continue;
    }
    if (ch === '>') {
      return i;
    }
    i++;
  }
  return -1;
}

// ─── Tag context detection helpers ──────────────────────────────────────────

export interface TagBounds {
  /** Index of the `<` character. */
  ltPos: number;
  /** Index of the closing `>`, or -1 if unclosed. */
  gtPos: number;
  /** True when the tag is a closing tag (`</`). */
  isClose: boolean;
  /** The full substring between < and > (exclusive). */
  inner: string;
}

/**
 * If `offset` is inside a tag (between `<` and `>`), return its boundaries.
 * Returns null when the cursor is outside any tag.
 */
export function findEnclosingTag(text: string, offset: number): TagBounds | null {
  // Walk backwards from offset to find the nearest unmatched `<`.
  let lt = -1;
  for (let i = Math.min(offset - 1, text.length - 1); i >= 0; i--) {
    if (text[i] === '<') {
      lt = i;
      break;
    }
    if (text[i] === '>') {
      // We hit a closing bracket before finding an opening bracket —
      // meaning the cursor is outside a tag.
      return null;
    }
  }
  if (lt === -1) {
    return null;
  }

  const gt = findTagEnd(text, lt);
  // cursor must be between < and > (inclusive of >)
  if (gt === -1 || offset > gt) {
    // tag is unclosed or cursor is past >
    // Treat unclosed tag as still "inside" if cursor is after lt
    if (gt === -1 && offset > lt) {
      const inner = text.slice(lt + 1, text.length);
      const isClose = inner.startsWith('/');
      return { ltPos: lt, gtPos: -1, isClose, inner };
    }
    return null;
  }
  const inner = text.slice(lt + 1, gt);
  const isClose = inner.startsWith('/');
  return { ltPos: lt, gtPos: gt, isClose, inner };
}

/**
 * Determine the attribute name at the cursor when the cursor is inside a
 * start tag. Returns the attribute name and whether the cursor is in the
 * name itself or in the value.
 */
export function resolveAttributeContext(
  inner: string,
  offsetInInner: number,
): { kind: 'name' | 'value' | 'none'; attrName: string | null } {
  // Walk backwards from offsetInInner to determine if we are in an
  // attribute name or value.

  // Check if we are inside a quoted value.
  let inQuote: string | null = null;
  let quoteStart = -1;
  for (let i = 0; i < offsetInInner; i++) {
    const ch = inner[i];
    if (inQuote === null) {
      if (ch === '"' || ch === "'") {
        inQuote = ch;
        quoteStart = i;
      }
    } else if (ch === inQuote) {
      inQuote = null;
      quoteStart = -1;
    }
  }

  if (inQuote !== null) {
    // Cursor is inside a quoted attribute value. Find the attribute name.
    // Scan backwards from quoteStart to find `=` and then the name.
    let eq = quoteStart - 1;
    while (eq >= 0 && inner[eq] === ' ') {
      eq--;
    }
    if (eq >= 0 && inner[eq] === '=') {
      let nameEnd = eq - 1;
      while (nameEnd >= 0 && inner[nameEnd] === ' ') {
        nameEnd--;
      }
      let nameStart = nameEnd;
      while (nameStart > 0 && isNameChar(inner[nameStart - 1])) {
        nameStart--;
      }
      const attrName = inner.slice(nameStart, nameEnd + 1);
      return { kind: 'value', attrName: attrName || null };
    }
    return { kind: 'value', attrName: null };
  }

  // Not inside a quoted value. Check if we are sitting in an attribute name.
  // Walk backwards from offsetInInner skipping name chars.
  // Also walk forward to capture full name
  let fwd = offsetInInner;
  while (fwd < inner.length && isNameChar(inner[fwd])) {
    fwd++;
  }
  let bkw = offsetInInner - 1;
  while (bkw >= 0 && isNameChar(inner[bkw])) {
    bkw--;
  }
  const potentialName = inner.slice(bkw + 1, fwd);

  if (potentialName.length === 0) {
    return { kind: 'none', attrName: null };
  }

  // Check if this name is followed by `=` (possibly with spaces) — that
  // would make it an attribute name. Also check if it is the tag name
  // itself (the first name token after `<`).
  // Find the end of the tag name (first token).
  let tn = 0;
  // skip optional `/` for close tags
  if (inner[tn] === '/') {
    tn++;
  }
  const tagNameEnd = tn;
  let tnEnd = tn;
  while (tnEnd < inner.length && isNameChar(inner[tnEnd])) {
    tnEnd++;
  }
  // If our potential name starts at the tag-name region, it is not an attr.
  if (bkw + 1 < tnEnd && bkw + 1 >= tagNameEnd) {
    return { kind: 'none', attrName: null };
  }

  return { kind: 'name', attrName: potentialName };
}

// ─── Path helpers ───────────────────────────────────────────────────────────

export function buildPath(entries: StackEntry[]): string[] {
  return entries.map((e) => (e.siblingIndex > 1 ? `${e.name}[${e.siblingIndex}]` : e.name));
}

export function buildPathWithCurrent(
  entries: StackEntry[],
  tagName: string,
  siblingIndex: number,
): string[] {
  const base = buildPath(entries);
  if (tagName) {
    base.push(siblingIndex > 1 ? `${tagName}[${siblingIndex}]` : tagName);
  }
  return base;
}

/**
 * Replace the content of XML comments (`<!-- ... -->`) with spaces,
 * preserving string length so that character offsets remain valid.
 * This prevents tag-like text inside comments from being matched by tag regexes.
 */
export function stripXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
}

// ─── XPath helpers ──────────────────────────────────────────────────────────

export function buildSimpleXPath(entries: StackEntry[]): string {
  if (entries.length === 0) return '';
  return '/' + entries.map((e) => e.name).join('/');
}

export function buildSimpleXPathWithCurrent(entries: StackEntry[], tagName: string): string {
  const parts = entries.map((e) => e.name);
  if (tagName) parts.push(tagName);
  if (parts.length === 0) return '';
  return '/' + parts.join('/');
}

export function buildXPathWithPredicates(entries: StackEntry[]): string {
  if (entries.length === 0) return '';
  return '/' + entries.map((e) => `${e.name}[${e.siblingIndex}]`).join('/');
}

export function buildXPathWithPredicatesWithCurrent(
  entries: StackEntry[],
  tagName: string,
  siblingIndex: number,
): string {
  const parts = entries.map((e) => `${e.name}[${e.siblingIndex}]`);
  if (tagName) parts.push(`${tagName}[${siblingIndex}]`);
  if (parts.length === 0) return '';
  return '/' + parts.join('/');
}
