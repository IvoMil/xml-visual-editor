import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface XmlTokenColors {
  tagColor: string;
  attrColor: string;
  attrValueColor: string;
}

let themeLog: vscode.LogOutputChannel | undefined;
function getThemeLog(): vscode.LogOutputChannel {
  if (!themeLog) {
    themeLog = vscode.window.createOutputChannel('XVE Theme', { log: true });
  }
  return themeLog;
}

// Module-level cache for resolved theme colors
let cachedColors: XmlTokenColors | undefined;

function getDefaultColors(): XmlTokenColors {
  const kind = vscode.window.activeColorTheme.kind;
  if (kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast) {
    return { tagColor: '#569CD6', attrColor: '#9CDCFE', attrValueColor: '#CE9178' };
  }
  return { tagColor: '#800000', attrColor: '#FF0000', attrValueColor: '#0000FF' };
}

/** Synchronous getter — reads from cache populated by resolveThemeColors() */
export function getXmlTokenColors(): XmlTokenColors {
  return cachedColors ?? getDefaultColors();
}

/** Call on activation and on theme change to refresh cached colors */
export async function resolveThemeColors(): Promise<void> {
  try {
    const colors = await extractThemeTokenColors();
    cachedColors = colors ?? getDefaultColors();
  } catch {
    cachedColors = getDefaultColors();
  }
}

/** Invalidate cache (call before resolveThemeColors on theme change) */
export function invalidateThemeColorCache(): void {
  cachedColors = undefined;
}

interface ThemeTokenColor {
  scope?: string | string[];
  settings?: { foreground?: string; fontStyle?: string };
}

interface ThemeJson {
  include?: string;
  tokenColors?: ThemeTokenColor[];
}

async function extractThemeTokenColors(): Promise<XmlTokenColors | undefined> {
  const log = getThemeLog();
  const themeId = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
  if (!themeId) {
    log.warn('extractThemeTokenColors: no colorTheme configured');
    return undefined;
  }
  log.info(`extractThemeTokenColors: themeId="${themeId}"`);

  const themeFilePath = findThemeFile(themeId);
  if (!themeFilePath) {
    log.warn(`extractThemeTokenColors: findThemeFile returned nothing for "${themeId}"`);
    return undefined;
  }
  log.info(`extractThemeTokenColors: themeFilePath="${themeFilePath}"`);

  const allTokenColors = await resolveTokenColors(themeFilePath);
  if (allTokenColors.length === 0) {
    log.warn('extractThemeTokenColors: resolveTokenColors returned 0 token colors');
    return undefined;
  }
  log.info(`extractThemeTokenColors: resolved ${allTokenColors.length} tokenColor rules`);

  const tagColor = findColorForScope(allTokenColors, ['entity.name.tag']);
  const attrColor = findColorForScope(allTokenColors, [
    'entity.other.attribute-name',
    'entity.other.attribute',
  ]);
  const valueColor = findColorForScope(allTokenColors, [
    'string.quoted.double.xml',
    'string.quoted.single.xml',
    'string.quoted.double',
    'string.quoted',
    'string.value',
    'string',
  ]);

  const defaults = getDefaultColors();
  const result = {
    tagColor: tagColor ?? defaults.tagColor,
    attrColor: attrColor ?? defaults.attrColor,
    attrValueColor: valueColor ?? defaults.attrValueColor,
  };
  log.info(
    `extractThemeTokenColors: tag=${tagColor ?? '(default)'}, ` +
      `attr=${attrColor ?? '(default)'}, value=${valueColor ?? '(default)'}`,
  );
  return result;
}

function findThemeFile(themeId: string): string | undefined {
  const log = getThemeLog();
  log.info(`findThemeFile: searching for themeId="${themeId}"`);

  // First pass: exact match
  for (const ext of vscode.extensions.all) {
    const pkg = ext.packageJSON as
      | { contributes?: { themes?: Array<{ id?: string; label?: string; path?: string }> } }
      | undefined;
    const themes = pkg?.contributes?.themes;
    if (!themes) continue;
    log.trace(`findThemeFile: checking ext "${ext.id}" (${themes.length} themes)`);
    for (const theme of themes) {
      if (theme.id === themeId || theme.label === themeId) {
        if (theme.path) {
          const filePath = path.join(ext.extensionPath, theme.path);
          log.info(`findThemeFile: exact match → ${filePath}`);
          return filePath;
        }
      }
    }
  }

  // Second pass: case-insensitive match
  const themeIdLower = themeId.toLowerCase();
  for (const ext of vscode.extensions.all) {
    const pkg = ext.packageJSON as
      | { contributes?: { themes?: Array<{ id?: string; label?: string; path?: string }> } }
      | undefined;
    const themes = pkg?.contributes?.themes;
    if (!themes) continue;
    for (const theme of themes) {
      if (theme.id?.toLowerCase() === themeIdLower || theme.label?.toLowerCase() === themeIdLower) {
        if (theme.path) {
          const filePath = path.join(ext.extensionPath, theme.path);
          log.info(`findThemeFile: case-insensitive match → ${filePath}`);
          return filePath;
        }
      }
    }
  }

  log.warn(`findThemeFile: no match found for "${themeId}"`);
  return undefined;
}

export function stripJsoncComments(text: string): string {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  let result = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    if (inString) {
      if (text[i] === '\\' && i + 1 < text.length) {
        result += text[i] + text[i + 1];
        i += 2;
      } else if (text[i] === '"') {
        result += '"';
        inString = false;
        i++;
      } else {
        result += text[i];
        i++;
      }
    } else {
      if (text[i] === '"') {
        result += '"';
        inString = true;
        i++;
      } else if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '/') {
        // Line comment — skip to end of line
        i += 2;
        while (i < text.length && text[i] !== '\n') i++;
      } else if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '*') {
        // Block comment
        i += 2;
        while (i < text.length && !(text[i] === '*' && i + 1 < text.length && text[i + 1] === '/'))
          i++;
        if (i < text.length) i += 2; // skip closing */
      } else {
        result += text[i];
        i++;
      }
    }
  }
  return result;
}

async function resolveTokenColors(
  themeFilePath: string,
  visited?: Set<string>,
): Promise<ThemeTokenColor[]> {
  const visitedSet = visited ?? new Set<string>();
  const log = getThemeLog();
  const resolved = path.resolve(themeFilePath);
  if (visitedSet.has(resolved)) {
    log.trace(`resolveTokenColors: skipping already-visited "${resolved}"`);
    return [];
  }
  visitedSet.add(resolved);

  if (!fs.existsSync(resolved)) {
    log.warn(`resolveTokenColors: file does not exist: "${resolved}"`);
    return [];
  }

  let content: string;
  try {
    content = fs.readFileSync(resolved, 'utf-8');
  } catch (e) {
    log.warn(`resolveTokenColors: failed to read "${resolved}": ${String(e)}`);
    return [];
  }

  let themeJson: ThemeJson;
  try {
    let stripped = stripJsoncComments(content);
    // Also strip trailing commas (valid JSONC, invalid JSON)
    stripped = stripped.replace(/,(\s*[}\]])/g, '$1');
    themeJson = JSON.parse(stripped) as ThemeJson;
  } catch (e) {
    log.warn(`resolveTokenColors: failed to parse "${resolved}": ${String(e)}`);
    return [];
  }

  // Resolve includes first (parent colors come first, child overrides)
  let parentColors: ThemeTokenColor[] = [];
  if (themeJson.include) {
    const includePath = path.resolve(path.dirname(resolved), themeJson.include);
    parentColors = await resolveTokenColors(includePath, visitedSet);
  }

  return [...parentColors, ...(themeJson.tokenColors ?? [])];
}

function findColorForScope(
  tokenColors: ThemeTokenColor[],
  targetScopes: string[],
): string | undefined {
  // For each target scope (in priority order), find the best matching rule.
  // TextMate matching: a rule with scope "string" matches token scope
  // "string.quoted.double.xml" (dot-separated prefix match). Among all
  // matching rules we pick the most specific (longest scope); ties broken
  // by order — later entries (child theme) take precedence.
  for (const target of targetScopes) {
    let bestColor: string | undefined;
    let bestSpecificity = -1;
    for (const tc of tokenColors) {
      if (!tc.settings?.foreground) continue;
      const scopes = Array.isArray(tc.scope) ? tc.scope : tc.scope ? [tc.scope] : [];
      for (const scope of scopes) {
        if (target === scope || target.startsWith(scope + '.')) {
          const specificity = scope.split('.').length;
          if (specificity >= bestSpecificity) {
            bestSpecificity = specificity;
            bestColor = tc.settings.foreground;
          }
        }
      }
    }
    if (bestColor) return bestColor;
  }
  return undefined;
}

export function getPanelFontCss(): string {
  const cfg = vscode.workspace.getConfiguration('xmlVisualEditor');
  const fontSize = cfg.get<number>('panels.fontSize', 0);
  const fontFamily = cfg.get<string>('panels.fontFamily', '');

  let css = '';
  if (fontSize > 0) {
    css += `body { font-size: ${fontSize}px; }\n`;
  }
  if (fontFamily) {
    css += `body { font-family: ${fontFamily}; }\n`;
  }
  return css;
}
