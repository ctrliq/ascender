import React from 'react';
import { fireEvent, screen, act } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import CodeEditor from './CodeEditor';

// CodeEditor pulls in ace-builds mode/theme files for their side effects; those
// expect the global `ace` that the real react-ace sets up on import. Since we
// mock react-ace below, neutralize those side-effect imports so they don't throw.
jest.mock('ace-builds/src-noconflict/mode-json', () => ({}));
jest.mock('ace-builds/src-noconflict/mode-javascript', () => ({}));
jest.mock('ace-builds/src-noconflict/mode-yaml', () => ({}));
jest.mock('ace-builds/src-noconflict/mode-django', () => ({}));
jest.mock('ace-builds/src-noconflict/theme-twilight', () => ({}));

// Mock react-ace so the controlled props CodeEditor passes through
// (mode/value/setOptions/onChange) are observable. Under jsdom the real
// react-ace keeps its value in an internal model that never reaches the DOM and
// editing it fires no onChange, so we render those props onto a textarea and
// forward edits to onChange instead.
jest.mock('react-ace', () => {
  const ReactMock = require('react');
  // class component so CodeEditor's ref (editor.current.refEditor) resolves
  class AceMock extends ReactMock.Component {
    render() {
      const { mode, value, onChange, setOptions, name } = this.props;
      return ReactMock.createElement(
        'div',
        {
          ref: (el) => {
            this.refEditor = el;
          },
        },
        ReactMock.createElement('textarea', {
          'data-testid': 'ace-editor',
          'data-mode': mode,
          name,
          value,
          readOnly: !!(setOptions && setOptions.readOnly),
          onChange: (e) => onChange && onChange(e.target.value),
        })
      );
    }
  }
  return { __esModule: true, default: AceMock };
});

describe('CodeEditor', () => {
  it('should render the ace editor in the requested mode with the given value', () => {
    const onChange = jest.fn();
    renderWithContexts(
      <CodeEditor
        id="code"
        value={'---\nfoo: bar'}
        onChange={onChange}
        mode="yaml"
      />
    );
    const editor = screen.getByTestId('ace-editor');
    // mode is mapped through aceModes (yaml -> yaml) and passed to the editor
    expect(editor).toHaveAttribute('data-mode', 'yaml');
    // the controlled value is passed through
    expect(editor).toHaveValue('---\nfoo: bar');
    // not read only -> editor is editable
    expect(editor).not.toHaveAttribute('readonly');
  });

  it('should render in read only mode', () => {
    const onChange = jest.fn();
    renderWithContexts(
      <CodeEditor
        id="code"
        value="---"
        onChange={onChange}
        mode="yaml"
        readOnly
      />
    );
    // readOnly is forwarded via setOptions.readOnly
    expect(screen.getByTestId('ace-editor')).toHaveAttribute('readonly');
  });

  it('should trigger the onChange prop (debounced) on edit', () => {
    jest.useFakeTimers();
    try {
      const onChange = jest.fn();
      renderWithContexts(
        <CodeEditor id="code" value={'---'} onChange={onChange} mode="yaml" />
      );
      fireEvent.change(screen.getByTestId('ace-editor'), {
        target: { value: '---\nfoo: bar' },
      });
      // CodeEditor wraps onChange in debounce(onChange, 250)
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(onChange).toHaveBeenCalledWith('---\nfoo: bar');
    } finally {
      jest.useRealTimers();
    }
  });
});
