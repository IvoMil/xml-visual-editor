import * as vscode from 'vscode';
import { stripXmlComments } from '../utils/xml-cursor-helpers';

export type CompletionContextType =
  | 'element-content'
  | 'tag-open'
  | 'attribute-value'
  | 'text-content'
  | 'unknown';

export interface CompletionContext {
  type: CompletionContextType;
  parentPath: string[];
  elementName?: string;
  attributeName?: string;
  precedingSibling?: string | null;
}

export function getCompletionContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): CompletionContext {
  const textBefore = document.getText(new vscode.Range(new vscode.Position(0, 0), position));

  const ctx = detectContextType(textBefore);
  if (ctx.type === 'unknown') {
    return { type: 'unknown', parentPath: [] };
  }

  if (ctx.type === 'attribute-value') {
    const tagName = extractCurrentTagName(textBefore);
    const parentPath = buildParentPath(textBefore);
    return {
      type: 'attribute-value',
      parentPath,
      elementName: tagName ?? undefined,
      attributeName: ctx.attributeName,
    };
  }

  if (ctx.type === 'tag-open') {
    const tagName = extractCurrentTagName(textBefore);
    const parentPath = buildParentPath(textBefore);
    return {
      type: 'tag-open',
      parentPath,
      elementName: tagName ?? undefined,
    };
  }

  // Check if this is text content of a leaf element
  const lastGt = textBefore.lastIndexOf('>');
  if (lastGt >= 0) {
    const textAfterGt = textBefore.substring(lastGt + 1);
    if (!textAfterGt.includes('<')) {
      const beforeGt = textBefore.substring(0, lastGt + 1);
      if (!beforeGt.endsWith('/>') && !beforeGt.endsWith('-->')) {
        const parentPath = buildParentPath(textBefore);
        return {
          type: 'text-content',
          parentPath,
          elementName: parentPath.length > 0 ? parentPath[parentPath.length - 1] : undefined,
        };
      }
    }
  }

  const { parentPath, precedingSibling } = buildParentPathWithSibling(textBefore);
  return { type: 'element-content', parentPath, precedingSibling };
}

function detectContextType(textBefore: string): {
  type: CompletionContextType;
  attributeName?: string;
} {
  let i = textBefore.length - 1;

  const attrCtx = detectAttributeValueContext(textBefore);
  if (attrCtx) {
    return { type: 'attribute-value', attributeName: attrCtx };
  }

  while (i >= 0) {
    const ch = textBefore[i];

    if (ch === '>') {
      if (i >= 2 && textBefore.substring(i - 2, i + 1) === '-->') {
        const commentStart = textBefore.lastIndexOf('<!--', i - 3);
        if (commentStart >= 0) {
          i = commentStart - 1;
          continue;
        }
      }
      return { type: 'element-content' };
    }

    if (ch === '<') {
      const afterAngle = textBefore.substring(i);
      if (
        afterAngle.startsWith('</') ||
        afterAngle.startsWith('<!--') ||
        afterAngle.startsWith('<!') ||
        afterAngle.startsWith('<?')
      ) {
        return { type: 'unknown' };
      }
      const tagContent = afterAngle.substring(1);
      const hasSpace = /^[a-zA-Z_][\w.:_-]*\s/.test(tagContent);
      if (hasSpace) {
        return { type: 'tag-open' };
      }
      return { type: 'element-content' };
    }

    i--;
  }

  return { type: 'element-content' };
}

function detectAttributeValueContext(textBefore: string): string | null {
  let i = textBefore.length - 1;
  let quoteChar: string | null = null;

  while (i >= 0) {
    const ch = textBefore[i];
    if (ch === '"' || ch === "'") {
      let j = i - 1;
      while (j >= 0 && textBefore[j] === ' ') {
        j--;
      }
      if (j >= 0 && textBefore[j] === '=') {
        quoteChar = ch;
        break;
      }
      return null;
    }
    if (ch === '>' || ch === '<') {
      return null;
    }
    i--;
  }

  if (!quoteChar || i < 0) {
    return null;
  }

  let eqPos = i - 1;
  while (eqPos >= 0 && textBefore[eqPos] === ' ') {
    eqPos--;
  }
  if (eqPos < 0 || textBefore[eqPos] !== '=') {
    return null;
  }

  let nameEnd = eqPos - 1;
  while (nameEnd >= 0 && textBefore[nameEnd] === ' ') {
    nameEnd--;
  }
  let nameStart = nameEnd;
  while (nameStart >= 0 && /[\w.:_-]/.test(textBefore[nameStart])) {
    nameStart--;
  }
  nameStart++;

  if (nameStart > nameEnd) {
    return null;
  }

  return textBefore.substring(nameStart, nameEnd + 1);
}

function extractCurrentTagName(textBefore: string): string | null {
  let i = textBefore.length - 1;
  while (i >= 0) {
    if (textBefore[i] === '<') {
      const after = textBefore.substring(i + 1);
      const match = after.match(/^([a-zA-Z_][\w.:_-]*)/);
      return match ? match[1] : null;
    }
    if (textBefore[i] === '>') {
      return null;
    }
    i--;
  }
  return null;
}

function buildIndexedPath(
  textBefore: string,
  trackSibling: boolean,
): { parentPath: string[]; precedingSibling: string | null } {
  const stack: { name: string; siblingIndex: number }[] = [];
  // siblingCountStack[d] tracks same-name counts for children at depth d
  const siblingCountStack: Map<string, number>[] = [new Map<string, number>()];
  let lastClosedSibling: string | null = null;
  // Strip XML comment content so tags inside comments are not matched
  const cleanText = stripXmlComments(textBefore);
  const tagRegex = /<\/?([a-zA-Z_][\w.:_-]*)(?:\s[^>]*)?\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(cleanText)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];

    if (fullMatch.startsWith('</')) {
      // Closing tag: pop matching element and remove child-level count maps
      for (let idx = stack.length - 1; idx >= 0; idx--) {
        if (stack[idx].name === tagName) {
          stack.splice(idx);
          // Keep siblingCountStack[idx] (same-depth sibling counts) but remove deeper levels
          siblingCountStack.splice(idx + 1);
          if (trackSibling) lastClosedSibling = tagName;
          break;
        }
      }
    } else if (!fullMatch.endsWith('/>')) {
      // Opening tag: push with sibling index
      if (trackSibling) lastClosedSibling = null;
      const depth = stack.length;
      const counts = siblingCountStack[depth] ?? new Map<string, number>();
      const count = (counts.get(tagName) ?? 0) + 1;
      counts.set(tagName, count);
      siblingCountStack[depth] = counts;
      stack.push({ name: tagName, siblingIndex: count });
      // Initialize child-level counts
      siblingCountStack[stack.length] = new Map<string, number>();
    } else {
      // Self-closing tag: update sibling count at current depth
      const depth = stack.length;
      const counts = siblingCountStack[depth] ?? new Map<string, number>();
      const count = (counts.get(tagName) ?? 0) + 1;
      counts.set(tagName, count);
      siblingCountStack[depth] = counts;
      if (trackSibling) lastClosedSibling = tagName;
    }
  }

  const parentPath = stack.map((e) =>
    e.siblingIndex > 1 ? `${e.name}[${e.siblingIndex}]` : e.name,
  );
  return { parentPath, precedingSibling: trackSibling ? lastClosedSibling : null };
}

function buildParentPath(textBefore: string): string[] {
  return buildIndexedPath(textBefore, false).parentPath;
}

export function buildParentPathWithSibling(textBefore: string): {
  parentPath: string[];
  precedingSibling: string | null;
} {
  return buildIndexedPath(textBefore, true);
}
