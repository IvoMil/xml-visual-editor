/** CSS custom properties mapped to VS Code theme variables */
export const GRID_THEME_CSS = `
  :root {
    --grid-bg: var(--vscode-editor-background);
    --grid-fg: var(--vscode-editor-foreground);
    --grid-border: var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
    --grid-header-bg: var(--vscode-editorGroupHeader-tabsBackground);
    --grid-structural-bg: var(--vscode-editorWidget-background, var(--vscode-editorGroupHeader-tabsBackground));
    --grid-structural-hover-bg: var(--vscode-list-hoverBackground);
    --grid-selection-bg: var(--vscode-list-activeSelectionBackground);
    --grid-selection-fg: var(--vscode-list-activeSelectionForeground);
    --grid-hover-bg: var(--vscode-list-hoverBackground);
    --grid-focus-border: var(--vscode-focusBorder);
    --grid-element-icon-color: var(--vscode-symbolIcon-classForeground, #ee9d28);
    --grid-attribute-icon-color: var(--vscode-symbolIcon-fieldForeground, #75beff);
    --grid-font-family: var(--vscode-font-family);
    --grid-font-size: var(--vscode-font-size);
  }
`;
