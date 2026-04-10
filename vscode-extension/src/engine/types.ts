export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id: number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: JsonRpcError;
  id: number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface Diagnostic {
  line: number;
  column: number;
  message: string;
  severity: string;
  element_path?: string;
}

export interface DocumentOpenResult {
  doc_id: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}

export interface ElementInfo {
  name: string;
  type_name: string;
  documentation: string;
  min_occurs: number;
  max_occurs: number | string;
  is_abstract: boolean;
  substitution_group: string;
}

export interface AttributeInfo {
  name: string;
  type_name: string;
  use: string;
  default_value: string;
  fixed_value: string;
  documentation: string;
  enum_values: string[];
}
