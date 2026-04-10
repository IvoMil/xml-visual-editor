import { ContentModelNode } from '../shared/schema-table-renderer';

/**
 * Check if a content model node or any of its descendants contains an element
 * with the given name.
 */
export function nodeContainsElement(node: ContentModelNode, name: string): boolean {
  if (node.node_type === 'element' && node.name === name) {
    return true;
  }
  return (node.children ?? []).some((c) => nodeContainsElement(c, name));
}

/**
 * Recursively mark all element nodes in a subtree as before_cursor.
 */
export function markSubtreeBeforeCursor(node: ContentModelNode): void {
  node.before_cursor = true;
  for (const child of node.children ?? []) {
    markSubtreeBeforeCursor(child);
  }
}

/**
 * Recursively mark cursor position within a branch (e.g., inside a sequence
 * within a choice). Elements before the preceding sibling get before_cursor,
 * elements after it stay unmarked.
 */
export function markCursorPositionInBranch(
  children: ContentModelNode[],
  precedingSibling: string,
): void {
  let found = false;
  for (const node of children) {
    if (!found && nodeContainsElement(node, precedingSibling)) {
      found = true;
      if (node.node_type === 'element' && node.name === precedingSibling) {
        node.before_cursor = true;
        if (node.can_insert) {
          node.cursor_adjacent = true;
        }
      } else {
        node.before_cursor = true;
        markCursorPositionInBranch(node.children ?? [], precedingSibling);
      }
    } else if (!found) {
      markSubtreeBeforeCursor(node);
    }
    // After found: leave as-is (not before_cursor)
  }
}

/**
 * Walk the top-level content model array and mark nodes as before_cursor
 * or cursor_adjacent based on the preceding sibling element name.
 */
export function markCursorPosition(
  contentModel: ContentModelNode[],
  precedingSibling: string,
): void {
  let found = false;

  for (const node of contentModel) {
    if (!found) {
      if (nodeContainsElement(node, precedingSibling)) {
        found = true;

        if (node.node_type === 'element') {
          // Direct element match
          markSubtreeBeforeCursor(node);
          if (node.can_insert) {
            node.cursor_adjacent = true;
          }
        } else if (node.can_insert) {
          // Compositor (choice/sequence/all) that is NOT exhausted —
          // the compositor itself is still available for more instances.
          // Mark children before the matching sibling as before_cursor.
          node.cursor_adjacent = true;
          let childFound = false;
          for (const child of node.children ?? []) {
            if (!childFound && nodeContainsElement(child, precedingSibling)) {
              childFound = true;
              child.before_cursor = true;
              // In an unbounded compositor, the preceding sibling is always cursor_adjacent
              // regardless of its own max_occurs (compositor allows more iterations)
              if (child.node_type === 'element' && child.name === precedingSibling) {
                child.cursor_adjacent = true;
              }
            } else if (!childFound) {
              markSubtreeBeforeCursor(child);
            }
          }
        } else {
          // Exhausted compositor — mark cursor position within active branch.
          // The compositor itself is exhausted (can't repeat), but cursor
          // position still matters for focus and element ordering.
          node.before_cursor = true;
          let childFound = false;
          for (const child of node.children ?? []) {
            if (!childFound && nodeContainsElement(child, precedingSibling)) {
              childFound = true;
              if (child.node_type === 'element' && child.name === precedingSibling) {
                child.before_cursor = true;
                if (child.can_insert) {
                  child.cursor_adjacent = true;
                }
              } else {
                // Branch (sequence/choice/all) containing the sibling —
                // recurse to mark position correctly within it
                child.before_cursor = true;
                markCursorPositionInBranch(child.children ?? [], precedingSibling);
              }
            } else if (!childFound) {
              markSubtreeBeforeCursor(child);
            }
            // After found: leave as-is (NOT before_cursor) —
            // these elements are after the cursor in schema order
          }
        }
      } else {
        // Everything before the found node is before cursor
        markSubtreeBeforeCursor(node);
      }
    }
    // Everything after found is left as-is (NOT before_cursor)
  }
}

/**
 * Compute the focused child name based on cursor position.
 * If in context F with a preceding sibling, focus on the cursor_adjacent element.
 * Otherwise return undefined.
 */
export function computeFocusedChild(
  contentModel: ContentModelNode[],
  precedingSibling: string | null | undefined,
  cursorContext: string,
): string | undefined {
  // Recursive deep search helper
  const findElement = (predicate: (n: ContentModelNode) => boolean): string | undefined => {
    const search = (nodes: ContentModelNode[]): string | undefined => {
      for (const node of nodes) {
        if (node.node_type === 'element') {
          if (node.before_cursor) continue;
          // Skip inactive choice branch elements (not insertable and not present in doc)
          if (!node.can_insert && (node.current_count ?? 0) === 0) continue;
          if (predicate(node)) return node.name ?? undefined;
        }
        // Always recurse into compositor children — they may contain
        // non-before_cursor elements even when the compositor is marked before_cursor
        // (e.g., exhausted compositor with cursor within active branch)
        if (node.children?.length) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return search(contentModel);
  };

  // Find the first visible (non-before_cursor, non-inactive) element in document order
  const findFirstNode = (): ContentModelNode | undefined => {
    const search = (nodes: ContentModelNode[]): ContentModelNode | undefined => {
      for (const node of nodes) {
        if (node.node_type === 'element') {
          if (node.before_cursor) continue;
          if (!node.can_insert && (node.current_count ?? 0) === 0) continue;
          return node;
        }
        // Always recurse into compositor children — exhausted compositors
        // may have non-before_cursor elements in their active branch
        if (node.children?.length) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return search(contentModel);
  };

  // Context E: cursor right after opening tag, no children before cursor
  if (cursorContext === 'E') {
    // Prefer the first visible element in document order (nearest to cursor)
    const first = findFirstNode();
    if (first) return first.name ?? undefined;
    // Fallback: priority chain for edge cases
    return (
      findElement((n) => !n.is_satisfied) ??
      findElement((n) => (n.current_count ?? 0) > 0) ??
      findElement((n) => n.can_insert)
    );
  }

  if (cursorContext !== 'F' && cursorContext !== 'G') {
    return undefined;
  }

  // F/G context without preceding sibling (cursor before first child)
  if (!precedingSibling) {
    // Prefer the first visible element in document order (nearest to cursor)
    const first = findFirstNode();
    if (first) return first.name ?? undefined;
    return (
      findElement((n) => !n.is_satisfied) ??
      findElement((n) => (n.current_count ?? 0) > 0) ??
      findElement((n) => n.can_insert)
    );
  }

  // First check: is the preceding sibling itself cursor_adjacent (unbounded)?
  for (const node of contentModel) {
    if (node.node_type === 'element' && node.cursor_adjacent && node.name === precedingSibling) {
      return node.name ?? undefined;
    }
    for (const child of node.children ?? []) {
      if (
        child.node_type === 'element' &&
        child.cursor_adjacent &&
        child.name === precedingSibling
      ) {
        return child.name ?? undefined;
      }
    }
  }

  const firstNode = findFirstNode();
  if (firstNode) {
    return firstNode.name ?? undefined;
  }

  return (
    findElement((n) => !n.is_satisfied) ??
    findElement((n) => (n.current_count ?? 0) > 0) ??
    findElement((n) => n.can_insert)
  );
}

/**
 * Extract the text content of an element given document text, cursor offset,
 * and the element name. Exported for testability.
 */
export function extractSimpleTextContent(
  text: string,
  offset: number,
  elementName: string,
): string {
  if (!text || offset < 0 || !elementName) return '';

  const openTag = '<' + elementName;

  // Search backward from cursor for the opening tag <elementName
  let tagStart = -1;
  for (let i = Math.min(offset, text.length - 1); i >= 0; i--) {
    if (text[i] === '<') {
      // Skip closing tags </...
      if (i + 1 < text.length && text[i + 1] === '/') continue;
      // Check if this is <elementName followed by whitespace, '>', or '/'
      if (text.startsWith(openTag, i)) {
        const afterName = i + openTag.length;
        if (
          afterName >= text.length ||
          text[afterName] === ' ' ||
          text[afterName] === '>' ||
          text[afterName] === '/' ||
          text[afterName] === '\t' ||
          text[afterName] === '\n' ||
          text[afterName] === '\r'
        ) {
          tagStart = i;
          break;
        }
      }
      // Found a different opening tag — stop searching
      break;
    }
  }
  if (tagStart === -1) return '';

  // Find the '>' that closes the opening tag (not '/>')
  let gtPos = -1;
  for (let i = tagStart + openTag.length; i < text.length; i++) {
    if (text[i] === '>') {
      if (i > 0 && text[i - 1] === '/') return ''; // self-closing
      gtPos = i;
      break;
    }
  }
  if (gtPos === -1) return '';

  // Find closing tag </elementName after the opening tag's '>'
  const closeTagStart = text.indexOf('</' + elementName, gtPos + 1);
  if (closeTagStart === -1) return '';

  return text.substring(gtPos + 1, closeTagStart).trim();
}
