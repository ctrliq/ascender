import type { CodeEditorMode } from './CodeEditor';

/**
 * The two modes the variables editors toggle between, named as the editor
 * names them: its javascript mode is what highlights JSON.
 */
export type VariablesMode = Extract<CodeEditorMode, 'yaml' | 'javascript'>;

export const YAML_MODE: VariablesMode = 'yaml';
export const JSON_MODE: VariablesMode = 'javascript';

/**
 * The ceiling on an editor's auto height, in rows. An uncapped editor renders
 * a line of DOM per line of content, and a host's facts run to thousands, which
 * costs seconds to paint and lags every scroll after. Fifty rows is about what
 * the 90vh this replaced allowed, and it holds the render cost flat however
 * long the value is. The rest scrolls.
 *
 * It lives here rather than in CodeEditor so that a screen reading it does not
 * have to import the editor: the prompt detail tests mock that module whole,
 * and a named export of theirs would come back undefined.
 */
export const MAX_ROWS = 50;

/** Where the config context leaves the installation's own cap for this. */
export const MAX_ROWS_STORAGE_KEY = 'max_editor_rows';

/**
 * The cap in force: what MAX_UI_EDITOR_ROWS says, or the built in number where
 * the settings have not been read yet or the browser refuses storage. Read at
 * render rather than held, so an editor mounted after the settings land uses
 * the installation's number without the value being threaded through a context
 * that nothing else on those screens needs.
 */
export function maxEditorRows(): number {
  try {
    const stored = Number(localStorage.getItem(MAX_ROWS_STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= 1) {
      return stored;
    }
  } catch {
    // A browser that refuses storage keeps the built in cap.
  }
  return MAX_ROWS;
}
