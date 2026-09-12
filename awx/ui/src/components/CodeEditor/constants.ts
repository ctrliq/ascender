import type { CodeEditorMode } from './CodeEditor';

/**
 * The two modes the variables editors toggle between, named as the editor
 * names them: its javascript mode is what highlights JSON.
 */
export type VariablesMode = Extract<CodeEditorMode, 'yaml' | 'javascript'>;

export const YAML_MODE: VariablesMode = 'yaml';
export const JSON_MODE: VariablesMode = 'javascript';
