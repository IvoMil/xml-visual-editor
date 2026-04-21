/**
 * XML element range detection — finds the full open/close tag span for the
 * element enclosing a given cursor offset.
 */

import {
  type StackEntry,
  skipComment,
  skipCdata,
  skipPI,
  isNameChar,
  parseTagName,
  findTagEnd,
  findEnclosingTag,
} from './xml-cursor-helpers';

// ─── Element range detection ────────────────────────────────────────────────

/**
 * Find the full range of the enclosing XML element at the given cursor offset.
 * Returns the byte offset of the opening `<` and the byte offset just past
 * the closing `>` (i.e., `closeEnd` is exclusive). For self-closing tags the
 * range covers the single tag.
 *
 * @returns `null` when the cursor is outside any element.
 */
export function findEnclosingElementRange(
  text: string,
  offset: number,
): { openStart: number; closeEnd: number } | null {
  const clampedOffset = Math.max(0, Math.min(offset, text.length));

  // Check if the cursor sits inside a tag.
  const tag = findEnclosingTag(text, clampedOffset);

  // Self-closing tag — the whole range is just this tag.
  if (tag !== null && !tag.isClose && tag.gtPos !== -1 && tag.inner.endsWith('/')) {
    return { openStart: tag.ltPos, closeEnd: tag.gtPos + 1 };
  }

  // Build stack up to clampedOffset (same logic as getElementAtCursor).
  const stack: StackEntry[] = [];
  let i = 0;

  while (i < clampedOffset) {
    if (text.startsWith('<!--', i)) {
      i = skipComment(text, i + 4);
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      i = skipCdata(text, i + 9);
      continue;
    }
    if (text.startsWith('<?', i)) {
      i = skipPI(text, i + 2);
      continue;
    }
    if (text.startsWith('</', i)) {
      const nameInfo = parseTagName(text, i + 2);
      const gt = findTagEnd(text, i);
      if (gt !== -1 && gt < clampedOffset) {
        if (stack.length > 0 && stack[stack.length - 1].name === nameInfo.name) {
          stack.pop();
        }
        i = gt + 1;
        continue;
      }
      break;
    }
    if (text[i] === '<' && i + 1 < text.length && isNameChar(text[i + 1])) {
      const nameInfo = parseTagName(text, i + 1);
      const gt = findTagEnd(text, i);
      if (gt !== -1 && gt < clampedOffset) {
        if (text[gt - 1] !== '/') {
          stack.push({
            name: nameInfo.name,
            startOffset: i,
            hasChildElements: false,
            hasText: false,
            siblingIndex: 1,
            childNameCounts: new Map(),
            lastClosedChildName: null,
          });
        }
        i = gt + 1;
        continue;
      }
      break;
    }
    if (text[i] === '<') {
      i++;
      continue;
    }
    const nextLt = text.indexOf('<', i);
    if (nextLt === -1 || nextLt >= clampedOffset) {
      break;
    }
    i = nextLt;
  }

  let elementName: string;
  let openStart: number;

  if (tag !== null && tag.isClose && tag.gtPos !== -1) {
    // Cursor is inside a closing tag — element is still on the stack.
    const closeName = parseTagName(tag.inner, 1).name;
    if (stack.length > 0 && stack[stack.length - 1].name === closeName) {
      return { openStart: stack[stack.length - 1].startOffset, closeEnd: tag.gtPos + 1 };
    }
    return null;
  } else if (tag !== null && !tag.isClose && tag.gtPos !== -1) {
    // Cursor is inside an opening tag.
    elementName = parseTagName(tag.inner, 0).name;
    openStart = tag.ltPos;
  } else {
    // Cursor is in element content (or outside all elements).
    if (stack.length === 0) {
      return null;
    }
    elementName = stack[stack.length - 1].name;
    openStart = stack[stack.length - 1].startOffset;
  }

  // Verify the opening tag and check for self-closing.
  const openGt = findTagEnd(text, openStart);
  if (openGt === -1) {
    return null;
  }
  if (text[openGt - 1] === '/') {
    return { openStart, closeEnd: openGt + 1 };
  }

  // Scan forward from after the opening tag to find the matching close tag.
  let depth = 1;
  let j = openGt + 1;

  while (j < text.length && depth > 0) {
    if (text.startsWith('<!--', j)) {
      j = skipComment(text, j + 4);
      continue;
    }
    if (text.startsWith('<![CDATA[', j)) {
      j = skipCdata(text, j + 9);
      continue;
    }
    if (text.startsWith('<?', j)) {
      j = skipPI(text, j + 2);
      continue;
    }
    if (text.startsWith('</', j)) {
      const nameInfo = parseTagName(text, j + 2);
      const gt = findTagEnd(text, j);
      if (gt === -1) {
        break;
      }
      if (nameInfo.name === elementName) {
        depth--;
        if (depth === 0) {
          return { openStart, closeEnd: gt + 1 };
        }
      }
      j = gt + 1;
      continue;
    }
    if (text[j] === '<' && j + 1 < text.length && isNameChar(text[j + 1])) {
      const nameInfo = parseTagName(text, j + 1);
      const gt = findTagEnd(text, j);
      if (gt === -1) {
        break;
      }
      if (text[gt - 1] !== '/' && nameInfo.name === elementName) {
        depth++;
      }
      j = gt + 1;
      continue;
    }
    j++;
  }

  return null;
}
