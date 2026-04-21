/**
 * Document lifecycle helpers — open handling and status-bar updates.
 * Extracted from extension.ts to keep that file under the 500-line limit.
 */

import * as vscode from 'vscode';
import { type EngineClient } from '../engine/engine-client';
import { type ValidationService } from '../services/validation-service';
import { type SchemaService } from '../services/schema-service';
import { type CursorTrackingService } from '../services/cursor-tracking-service';
import { type XmlActionsProvider } from '../panels/xml-actions-provider';

export interface DocumentHandlerDeps {
  schemaService: SchemaService | undefined;
  xmlActionsProvider: XmlActionsProvider | undefined;
  engineClient: EngineClient | undefined;
  cursorTrackingService: CursorTrackingService | undefined;
  validationService: ValidationService | undefined;
}

export async function handleDocumentOpen(
  document: vscode.TextDocument,
  deps: DocumentHandlerDeps,
): Promise<void> {
  if (document.languageId !== 'xml') {
    return;
  }

  const { schemaService, xmlActionsProvider, engineClient, cursorTrackingService, validationService } =
    deps;

  // Try to auto-load schema
  const schemaLoadResult = (await schemaService?.loadSchemaForDocument(document)) ?? 'no-reference';

  // Update actions panel with schema info
  const schemaId = schemaService?.getSchemaIdForDocument(document.uri.toString());
  if (schemaId) {
    xmlActionsProvider?.setSchema(schemaId);
  } else {
    xmlActionsProvider?.setSchema('');
  }

  // Sync document content to engine so panels can read current attribute values
  if (engineClient?.isReady()) {
    await engineClient
      .sendRequest('document.update', {
        doc_id: document.uri.toString(),
        content: document.getText(),
      })
      .catch(() => {
        /* Engine may not support document.update yet */
      });
  }

  // Refresh panels in case schema was just loaded
  cursorTrackingService?.forceRefresh();

  // Validate
  await validationService?.validateFull(document);

  // Update actions panel with validation status
  const diagnosticCount = vscode.languages.getDiagnostics(document.uri).length;
  if (schemaLoadResult === 'load-failed' && diagnosticCount === 0) {
    // Schema reference found but couldn't be loaded — don't show misleading "Valid"
    xmlActionsProvider?.setValidationStatus(-2);
  } else {
    xmlActionsProvider?.setValidationStatus(diagnosticCount);
  }
}

export function updateStatusBar(
  statusBarItem: vscode.StatusBarItem | undefined,
  state: 'ready' | 'starting' | 'error',
): void {
  if (!statusBarItem) {
    return;
  }

  switch (state) {
    case 'ready':
      statusBarItem.text = '$(check) XVE: Ready';
      statusBarItem.tooltip = 'XML Visual Editor engine is running';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'starting':
      statusBarItem.text = '$(loading~spin) XVE: Starting...';
      statusBarItem.tooltip = 'XML Visual Editor engine is starting';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'error':
      statusBarItem.text = '$(error) XVE: Error';
      statusBarItem.tooltip = 'XML Visual Editor engine encountered an error';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      break;
  }
}
