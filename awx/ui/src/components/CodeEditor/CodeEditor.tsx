import React, { useEffect, useRef, useCallback, useMemo } from 'react';

import { EditorState, Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  highlightSpecialChars,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  search,
  searchKeymap,
  highlightSelectionMatches,
} from '@codemirror/search';
import {
  StreamLanguage,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
} from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { jinja2 } from '@codemirror/legacy-modes/mode/jinja2';

import { useLingui } from '@lingui/react/macro';

import styled from 'styled-components';
import debounce from 'util/debounce';
import { editorTheme, editorHighlightStyle } from './theme';

const LINE_HEIGHT = 24;
// the scroll margins below: 4px above the first line and 4px below the last
const PADDING = 8;
// The ceiling on the auto height. An uncapped editor renders a line of DOM per
// line of content, and a host's facts run to thousands, which costs seconds to
// paint and lags every scroll after. Fifty rows is about what the 90vh this
// replaced allowed, and it holds the render cost flat however long the value
// is. The rest scrolls.
const MAX_ROWS = 50;

const FocusWrapper = styled.div`
  && + .keyboard-help-text {
    opacity: 0;
    transition: opacity 0.1s linear;
  }

  &:focus-within + .keyboard-help-text {
    opacity: 1;
  }
`;

const EditorWrapper = styled.div<{
  $hasErrors?: boolean;
  $isReadOnly?: boolean;
}>`
  & .cm-editor {
    /* the form control's own border is drawn by PatternFly on this wrapper */
    outline: none;
  }

  & .cm-editor.cm-focused {
    outline: none;
  }

  ${(props) =>
    props.$hasErrors &&
    `
    && {
      --pf-v6-c-form-control--PaddingRight: var(--pf-v6-c-form-control--invalid--PaddingRight);
      --pf-v6-c-form-control--BorderBottomColor: var(--pf-v6-c-form-control--invalid--BorderBottomColor);
      padding-right: 24px;
      padding-bottom: var(--pf-v6-c-form-control--invalid--PaddingBottom);
      background: var(--pf-v6-c-form-control--invalid--Background);
      border-bottom-width: var(--pf-v6-c-form-control--invalid--BorderBottomWidth);
    }`}

  ${(props) =>
    props.$isReadOnly &&
    `
    && .cm-cursor {
      display: none;
    }
    &&.pf-v6-c-form-control {
      border: none;
      outline: none;
      padding: 0;
    }
    &&.pf-v6-c-form-control:focus,
    &&.pf-v6-c-form-control:focus-within,
    &&.pf-v6-c-form-control:hover {
      border: none;
      outline: none;
      box-shadow: none;
    }
    &&.pf-v6-c-form-control::before,
    &&.pf-v6-c-form-control::after {
      border: none;
    }
    `}
`;

/**
 * The languages the editor knows, named as the UI names them rather than as
 * the editor does: javascript is the JSON half of the variables toggle, and
 * is highlighted as JSON, which is what ace did with it too.
 */
export type CodeEditorMode = 'javascript' | 'yaml' | 'jinja2' | 'json';

/**
 * Editing, and the cues that only mean something while editing: a read-only
 * editor shows no active line and no active gutter line, which is how the
 * detail views looked before.
 */
const editableExtensions = (readOnly: boolean): Extension =>
  readOnly
    ? [EditorView.editable.of(false), EditorState.readOnly.of(true)]
    : [
        EditorView.editable.of(true),
        EditorState.readOnly.of(false),
        highlightActiveLine(),
        highlightActiveLineGutter(),
      ];

const languages: Record<CodeEditorMode, () => Extension> = {
  javascript: json,
  json,
  yaml,
  jinja2: () => StreamLanguage.define(jinja2),
};

export interface CodeEditorProps {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  /**
   * Declared method style on purpose: the handler is formik's own, which takes
   * an event or a field name, and it is handed straight to whichever
   * PatternFly input the field renders, which names its own event type.
   */
  onBlur?(event?: React.SyntheticEvent): void;
  mode: CodeEditorMode;
  readOnly?: boolean;
  hasErrors?: boolean;
  /** A fixed number of rows, or 'auto' to grow with the content. */
  rows?: number | 'auto';
  minRows?: number;
  maxRows?: number;
  className?: string;
}

function CodeEditor({
  id,
  value = '',
  onChange = () => {},
  onFocus,
  onBlur,
  mode,
  readOnly = false,
  hasErrors = false,
  rows = 6,
  minRows = 1,
  maxRows = MAX_ROWS,
  className = '',
}: CodeEditorProps) {
  const { t } = useLingui();
  if (rows && typeof rows !== 'number' && rows !== 'auto') {
    // eslint-disable-next-line no-console
    console.warn(
      `CodeEditor: Unexpected value for 'rows': ${rows}; expected number or 'auto'`
    );
  }

  const wrapper = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // The handlers live in refs so that a parent re-rendering with new closures
  // does not tear the editor down and build it again, which would lose the
  // cursor on every keystroke.
  const handlers = useRef({ onChange, onFocus, onBlur });
  handlers.current = { onChange, onFocus, onBlur };

  // one debounce for the life of the editor, as ace's onChange had
  const emit = useMemo(
    () =>
      debounce((next: string) => {
        handlers.current.onChange(next);
      }, 250),
    []
  );

  // Compartments let mode, read-only and height be reconfigured in place
  // rather than by rebuilding the state.
  const language = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const height = useRef(new Compartment());

  // 'auto' sizes the box from the content, one line per row, never below
  // minRows and never above maxRows, so a short value still reads as an editor
  // and a long one shows all of itself. A number of rows is a fixed height.
  const isAuto = rows === 'auto';
  const heightTheme = useMemo(() => {
    if (!isAuto) {
      return EditorView.theme({
        '.cm-scroller': {
          height: `${(rows as number) * LINE_HEIGHT + PADDING}px`,
          overflow: 'auto',
        },
      });
    }
    return EditorView.theme({
      '.cm-scroller': {
        minHeight: `${minRows * LINE_HEIGHT + PADDING}px`,
        maxHeight: `${maxRows * LINE_HEIGHT + PADDING}px`,
        overflow: 'auto',
      },
    });
  }, [isAuto, rows, minRows, maxRows]);

  useEffect(() => {
    const parent = host.current;
    if (!parent) {
      return undefined;
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        editorTheme,
        syntaxHighlighting(editorHighlightStyle),
        language.current.of(languages[mode]?.() ?? []),
        editable.current.of(editableExtensions(readOnly)),
        height.current.of(heightTheme),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            emit(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          focus: () => {
            handlers.current.onFocus?.();
          },
          blur: () => {
            handlers.current.onBlur?.();
          },
        }),
      ],
    });

    view.current = new EditorView({ state, parent });

    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // built once: every prop that can change is reconfigured below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The editable element is the one a form label points at, and the one a
  // screen reader announces, so it carries the id and a name. Where the field
  // rendered a PatternFly label, that label is the name; otherwise a generic
  // one, because an unnamed text box is worse than a plainly named one.
  useEffect(() => {
    const content = view.current?.contentDOM;
    if (!content) {
      return;
    }
    // Editing is entered from the wrapper with Enter, so the editable content
    // stays out of the tab order. A read-only editor has no wrapper to focus
    // and still scrolls, so it is the tab stop instead: without one, a keyboard
    // user cannot reach the scroll area at all.
    content.tabIndex = readOnly ? 0 : -1;
    if (id) {
      content.id = id;
      const label = document.querySelector<HTMLElement>(
        `label[for="${CSS.escape(id)}"]`
      );
      if (label) {
        if (!label.id) {
          label.id = `${id}-label`;
        }
        content.setAttribute('aria-labelledby', label.id);
        return;
      }
    }
    content.setAttribute('aria-label', t`Code editor`);
  }, [readOnly, id, t]);

  useEffect(() => {
    view.current?.dispatch({
      effects: language.current.reconfigure(languages[mode]?.() ?? []),
    });
  }, [mode]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure(editableExtensions(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    view.current?.dispatch({
      effects: height.current.reconfigure(heightTheme),
    });
  }, [heightTheme]);

  // A value arriving from outside replaces the document, with the cursor kept
  // where it was as far as the new length allows. Typing does not come back
  // through here: onChange is debounced, so the value the parent hands back is
  // the text the document already holds and this is a no-op.
  useEffect(() => {
    const editor = view.current;
    if (!editor) {
      return;
    }
    const current = editor.state.doc.toString();
    if (value === current) {
      return;
    }
    const anchor = Math.min(editor.state.selection.main.anchor, value.length);
    editor.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor },
    });
  }, [value]);

  const listen = useCallback((event: KeyboardEvent) => {
    if (wrapper.current === document.activeElement && event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      view.current?.focus();
    }
  }, []);

  useEffect(() => {
    const wrapperEl = wrapper.current;
    if (!wrapperEl) {
      return undefined;
    }
    wrapperEl.addEventListener('keydown', listen);

    return () => {
      wrapperEl.removeEventListener('keydown', listen);
    };
  }, [listen]);

  // Escape and Shift-Tab hand focus back to the wrapper, which is what the
  // helper text below the editor promises.
  const escape = useCallback((event: React.KeyboardEvent) => {
    // Escape closes the search panel first, where one is open: the editor's own
    // keymap handles that and marks the event, so this leaves it alone.
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === 'Escape' || (event.key === 'Tab' && event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      wrapper.current?.focus();
    }
  }, []);

  return (
    <>
      <FocusWrapper ref={wrapper} tabIndex={readOnly ? -1 : 0}>
        <EditorWrapper
          ref={host}
          data-cy="code-editor"
          className={`pf-v6-c-form-control ${className}`}
          $hasErrors={hasErrors}
          $isReadOnly={readOnly}
          onKeyDown={escape}
        />
      </FocusWrapper>
      {!readOnly && (
        <div
          className="pf-v6-c-form__helper-text keyboard-help-text"
          aria-live="polite"
        >
          {t`Press Enter to edit. Press ESC to stop editing.`}
        </div>
      )}
    </>
  );
}
export default CodeEditor;
