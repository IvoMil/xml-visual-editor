/**
 * XML Cursor Parser — fast client-side text parser that determines the
 * element and context at a given cursor offset without using the engine.
 */

import {
  type CursorElementInfo,
  type StackEntry,
  skipComment,
  skipCdata,
  skipPI,
  isNameChar,
  parseTagName,
  findTagEnd,
  findEnclosingTag,
  resolveAttributeContext,
  buildPath,
  buildPathWithCurrent,
  buildSimpleXPath,
  buildSimpleXPathWithCurrent,
  buildXPathWithPredicates,
  buildXPathWithPredicatesWithCurrent,
} from './xml-cursor-helpers';

export type { CursorContextType, CursorElementInfo } from './xml-cursor-helpers';

// ─── Main export ────────────────────────────────────────────────────────────

/**
 * Determine the XML element, path, and cursor context at a given character
 * offset in the document text.
 *
 * @param text  Full document text.
 * @param offset  Zero-based character offset of the cursor.
 * @returns Cursor element information.
 */
export function getElementAtCursor(text: string, offset: number): CursorElementInfo {
  const clampedOffset = Math.max(0, Math.min(offset, text.length));

  // 1. Build tag stack by scanning from 0 to offset.
  const stack: StackEntry[] = [];
  let i = 0;

  // Track whether the current top-of-stack element had child elements or
  // text content *before* the cursor.
  const markChildOnStack = (): void => {
    if (stack.length > 0) {
      stack[stack.length - 1].hasChildElements = true;
    }
  };

  const markTextOnStack = (from: number, to: number): void => {
    if (stack.length > 0) {
      // Only count non-whitespace as meaningful text.
      const slice = text.slice(from, to);
      if (/\S/.test(slice)) {
        stack[stack.length - 1].hasText = true;
      }
    }
  };

  while (i < clampedOffset) {
    // --- Comment ---
    if (text.startsWith('<!--', i)) {
      const end = skipComment(text, i + 4);
      i = end;
      continue;
    }

    // --- CDATA ---
    if (text.startsWith('<![CDATA[', i)) {
      const end = skipCdata(text, i + 9);
      if (stack.length > 0) {
        stack[stack.length - 1].hasText = true;
      }
      i = end;
      continue;
    }

    // --- Processing instruction ---
    if (text.startsWith('<?', i)) {
      const end = skipPI(text, i + 2);
      i = end;
      continue;
    }

    // --- Close tag ---
    if (text.startsWith('</', i)) {
      const nameInfo = parseTagName(text, i + 2);
      const gt = findTagEnd(text, i);
      if (gt !== -1 && gt < clampedOffset) {
        // Pop matching entry from stack.
        if (stack.length > 0 && stack[stack.length - 1].name === nameInfo.name) {
          stack.pop();
          // Track last closed direct child for cursor position awareness
          if (stack.length > 0) {
            stack[stack.length - 1].lastClosedChildName = nameInfo.name;
          }
        }
        i = gt + 1;
        continue;
      }
      // Tag is unclosed or > is past offset — stop scanning.
      break;
    }

    // --- Open / self-closing tag ---
    if (text[i] === '<' && i + 1 < text.length && isNameChar(text[i + 1])) {
      const nameInfo = parseTagName(text, i + 1);
      const gt = findTagEnd(text, i);
      if (gt !== -1 && gt < clampedOffset) {
        const selfClosing = text[gt - 1] === '/';
        if (selfClosing) {
          markChildOnStack();
          if (stack.length > 0) {
            const parent = stack[stack.length - 1];
            parent.childNameCounts.set(
              nameInfo.name,
              (parent.childNameCounts.get(nameInfo.name) ?? 0) + 1,
            );
            parent.lastClosedChildName = nameInfo.name;
          }
        } else {
          markChildOnStack();
          let sibIdx = 1;
          if (stack.length > 0) {
            const parent = stack[stack.length - 1];
            const newCount = (parent.childNameCounts.get(nameInfo.name) ?? 0) + 1;
            parent.childNameCounts.set(nameInfo.name, newCount);
            sibIdx = newCount;
          }
          stack.push({
            name: nameInfo.name,
            startOffset: i,
            hasChildElements: false,
            hasText: false,
            siblingIndex: sibIdx,
            childNameCounts: new Map(),
            lastClosedChildName: null,
          });
        }
        i = gt + 1;
        continue;
      }
      // Tag is unclosed or > is past offset — stop scanning.
      break;
    }

    // --- Bare `<` not matching any tag pattern (malformed XML during typing) ---
    if (text[i] === '<') {
      i++;
      continue;
    }

    // --- Regular text ---
    const nextLt = text.indexOf('<', i);
    if (nextLt === -1 || nextLt >= clampedOffset) {
      markTextOnStack(i, clampedOffset);
      break;
    }
    markTextOnStack(i, nextLt);
    i = nextLt;
  }

  // 2. Determine cursor context.
  const tag = findEnclosingTag(text, clampedOffset);

  if (tag !== null) {
    // Cursor is inside a tag.
    if (tag.isClose) {
      // Context G — inside a closing tag.
      const closedName = tag.inner.slice(1).trim();

      // The closed element is still on the stack (not yet popped since > >= offset).
      // Treat like context F: parent is the anchor, closed element is preceding sibling.
      if (stack.length > 0 && stack[stack.length - 1].name === closedName) {
        const closedEntry = stack.pop()!;
        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          const parentPath = buildPath(stack);
          const parentSimpleXPath = buildSimpleXPath(stack);
          const parentXPathPred = buildXPathWithPredicates(stack);
          stack.push(closedEntry);
          return {
            elementName: parent.name,
            elementPath: parentPath,
            cursorContext: 'G',
            currentAttribute: null,
            precedingSiblingName: closedName,
            simpleXPath: parentSimpleXPath,
            xpathWithPredicates: parentXPathPred,
          };
        }
        stack.push(closedEntry);
      }

      // Fallback: no parent on stack
      return {
        elementName: closedName || (stack.length > 0 ? stack[stack.length - 1].name : null),
        elementPath: buildPath(stack),
        cursorContext: 'G',
        currentAttribute: null,
        precedingSiblingName: null,
        simpleXPath: buildSimpleXPath(stack),
        xpathWithPredicates: buildXPathWithPredicates(stack),
      };
    }

    // Opening / self-closing tag. Determine sub-context A/B/C/D.
    const offsetInInner = clampedOffset - tag.ltPos - 1;

    // Find end of tag name in inner.
    let tn = 0;
    while (tn < tag.inner.length && isNameChar(tag.inner[tn])) {
      tn++;
    }
    const tagName = tag.inner.slice(0, tn);

    // Compute sibling index for the current tag (not yet on the stack).
    let currentSibIdx = 1;
    if (stack.length > 0 && tagName) {
      const parent = stack[stack.length - 1];
      currentSibIdx = (parent.childNameCounts.get(tagName) ?? 0) + 1;
    }

    if (offsetInInner <= tn) {
      // Context A — cursor is in the tag name.
      return {
        elementName: tagName || null,
        elementPath: buildPathWithCurrent(stack, tagName, currentSibIdx),
        cursorContext: 'A',
        currentAttribute: null,
        precedingSiblingName: null,
        simpleXPath: buildSimpleXPathWithCurrent(stack, tagName),
        xpathWithPredicates: buildXPathWithPredicatesWithCurrent(stack, tagName, currentSibIdx),
      };
    }

    // Past the tag name — could be B, C, or D.
    const attrCtx = resolveAttributeContext(tag.inner, offsetInInner);
    if (attrCtx.kind === 'value') {
      return {
        elementName: tagName || null,
        elementPath: buildPathWithCurrent(stack, tagName, currentSibIdx),
        cursorContext: 'D',
        currentAttribute: attrCtx.attrName,
        precedingSiblingName: null,
        simpleXPath: buildSimpleXPathWithCurrent(stack, tagName),
        xpathWithPredicates: buildXPathWithPredicatesWithCurrent(stack, tagName, currentSibIdx),
      };
    }
    if (attrCtx.kind === 'name') {
      return {
        elementName: tagName || null,
        elementPath: buildPathWithCurrent(stack, tagName, currentSibIdx),
        cursorContext: 'C',
        currentAttribute: attrCtx.attrName,
        precedingSiblingName: null,
        simpleXPath: buildSimpleXPathWithCurrent(stack, tagName),
        xpathWithPredicates: buildXPathWithPredicatesWithCurrent(stack, tagName, currentSibIdx),
      };
    }

    // Context B — in the tag but not in an attribute.
    return {
      elementName: tagName || null,
      elementPath: buildPathWithCurrent(stack, tagName, currentSibIdx),
      cursorContext: 'B',
      currentAttribute: null,
      precedingSiblingName: null,
      simpleXPath: buildSimpleXPathWithCurrent(stack, tagName),
      xpathWithPredicates: buildXPathWithPredicatesWithCurrent(stack, tagName, currentSibIdx),
    };
  }

  // Cursor is outside any tag.
  if (stack.length === 0) {
    return {
      elementName: null,
      elementPath: [],
      cursorContext: 'I',
      currentAttribute: null,
      precedingSiblingName: null,
      simpleXPath: '',
      xpathWithPredicates: '',
    };
  }

  const top = stack[stack.length - 1];
  const elementPath = buildPath(stack);

  // Determine E, F, or H.
  if (top.hasChildElements) {
    return {
      elementName: top.name,
      elementPath,
      cursorContext: 'F',
      currentAttribute: null,
      precedingSiblingName: top.lastClosedChildName ?? null,
      simpleXPath: buildSimpleXPath(stack),
      xpathWithPredicates: buildXPathWithPredicates(stack),
    };
  }

  // Check if there is text around the cursor position.
  if (top.hasText || hasTextAroundOffset(text, clampedOffset, top.startOffset)) {
    return {
      elementName: top.name,
      elementPath,
      cursorContext: 'H',
      currentAttribute: null,
      precedingSiblingName: null,
      simpleXPath: buildSimpleXPath(stack),
      xpathWithPredicates: buildXPathWithPredicates(stack),
    };
  }

  return {
    elementName: top.name,
    elementPath,
    cursorContext: 'E',
    currentAttribute: null,
    precedingSiblingName: null,
    simpleXPath: buildSimpleXPath(stack),
    xpathWithPredicates: buildXPathWithPredicates(stack),
  };
}

/**
 * Check whether there is non-whitespace text between the opening tag's `>`
 * and the cursor, or between the cursor and the next `<`.
 */
function hasTextAroundOffset(text: string, offset: number, tagStartOffset: number): boolean {
  // Find the `>` that ends the opening tag.
  const gt = findTagEnd(text, tagStartOffset);
  if (gt === -1) {
    return false;
  }
  const contentStart = gt + 1;
  const nextLt = text.indexOf('<', offset);
  const contentEnd = nextLt === -1 ? text.length : nextLt;
  const before = text.slice(contentStart, offset);
  const after = text.slice(offset, contentEnd);
  return /\S/.test(before) || /\S/.test(after);
}

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
