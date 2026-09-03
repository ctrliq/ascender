import React, { useEffect, useRef, useCallback } from 'react';

import ReactAce from 'react-ace';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/mode-django';
import 'ace-builds/src-noconflict/theme-twilight';

import { useLingui } from '@lingui/react/macro';

import styled from 'styled-components';
import debounce from 'util/debounce';

const LINE_HEIGHT = 24;
// the scroll margins below: 4px above the first line and 4px below the last
const PADDING = 8;

const FocusWrapper = styled.div`
  && + .keyboard-help-text {
    opacity: 0;
    transition: opacity 0.1s linear;
  }

  &:focus-within + .keyboard-help-text {
    opacity: 1;
  }

  & .ace_hidden-cursors .ace_cursor {
    opacity: 0;
  }
`;

const AceEditor = styled(ReactAce)`
  font-family: var(--pf-t--global--font--family--mono, monospace);
  /* The height, ours or ace's, is the content: lines plus the scroll margins.
     Content-box keeps the border from eating into the bottom margin, and the
     width then has to come from block layout rather than react-ace's inline
     100%, which would overflow by the border. */
  box-sizing: content-box;
  width: auto !important;

  & .ace_marker-layer .ace_active-line {
    background: var(--pf-v6-global--BorderColor--300) !important;
  }

  & .ace_gutter {
    background: var(--pf-v6-global--BackgroundColor--200);
    color: var(--pf-v6-global--Color--200);
  }

  & .ace_scrollbar {
    scrollbar-width: thin;
  }

  & .ace_mobile-menu {
    display: none;
  }

  & .ace_marker-layer .ace_selection {
    background: var(--pf-v6-global--BorderColor--100);
  }

  & .ace_marker-layer .ace_bracket {
    display: none;
  }

  ${(props) =>
    props.hasErrors &&
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
    props.setOptions.readOnly &&
    `
    && .ace_cursor {
      opacity: 0;
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
AceEditor.displayName = 'AceEditor';

function CodeEditor({
  id,
  value,
  onChange = () => {},
  onFocus,
  onBlur,
  mode,
  readOnly = false,
  hasErrors = false,
  rows = 6,
  minRows = 1,
  className = '',
}) {
  const { t } = useLingui();
  if (rows && typeof rows !== 'number' && rows !== 'auto') {
    // eslint-disable-next-line no-console
    console.warn(
      `CodeEditor: Unexpected value for 'rows': ${rows}; expected number or 'auto'`
    );
  }

  const wrapper = useRef(null);
  const editor = useRef(null);

  useEffect(() => {
    const editorInput = editor.current.refEditor?.querySelector('textarea');
    if (!editorInput) {
      return;
    }
    if (!readOnly) {
      editorInput.tabIndex = -1;
    }
    editorInput.id = id;
  }, [readOnly, id]);

  const listen = useCallback((event) => {
    if (wrapper.current === document.activeElement && event.key === 'Enter') {
      const editorInput = editor.current.refEditor?.querySelector('textarea');
      if (!editorInput) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      editorInput.focus();
    }
  }, []);

  useEffect(() => {
    const wrapperEl = wrapper.current;
    wrapperEl.addEventListener('keydown', listen);

    return () => {
      wrapperEl.removeEventListener('keydown', listen);
    };
  });

  const aceModes = {
    javascript: 'json',
    yaml: 'yaml',
    jinja2: 'django',
    json: 'json',
  };

  // 'auto' lets ace size the box from its own measured line height, one line
  // per row and never below minRows, so a short value still reads as an editor
  // and a long one shows all of itself. Computing the height here from a fixed
  // line height leaves the difference as a gap under the last line wherever
  // the font renders lines shorter than that.
  const isAuto = rows === 'auto';
  const height = isAuto ? 'auto' : `${rows * LINE_HEIGHT + PADDING}px`;

  return (
    <>
      <FocusWrapper ref={wrapper} tabIndex={readOnly ? -1 : 0}>
        <AceEditor
          mode={aceModes[mode] || 'text'}
          className={`pf-v6-c-form-control ${className}`}
          theme="twilight"
          onChange={debounce(onChange, 250)}
          value={value}
          onFocus={onFocus}
          onBlur={onBlur}
          name={`${id}-editor` || 'code-editor'}
          editorProps={{ $blockScrolling: true }}
          fontSize={16}
          width="100%"
          height={height}
          minLines={isAuto ? minRows : undefined}
          maxLines={isAuto ? Infinity : undefined}
          // the breathing room above the first and below the last line. Ace's
          // own margin rather than CSS padding on the scroller, so that the
          // auto-height above accounts for it.
          scrollMargin={[4, 4, 0, 0]}
          hasErrors={hasErrors}
          setOptions={{
            readOnly,
            highlightActiveLine: !readOnly,
            highlightGutterLine: !readOnly,
            useWorker: false,
            showPrintMargin: false,
            showFoldWidgets: false,
          }}
          commands={[
            {
              name: 'escape',
              bindKey: { win: 'Esc', mac: 'Esc' },
              exec: () => {
                wrapper.current.focus();
              },
            },
            {
              name: 'tab escape',
              bindKey: { win: 'Shift-Tab', mac: 'Shift-Tab' },
              exec: () => {
                wrapper.current.focus();
              },
            },
          ]}
          ref={editor}
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
