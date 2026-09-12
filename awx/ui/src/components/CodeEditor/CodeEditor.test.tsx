import React from 'react';
import { fireEvent, screen, act } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import CodeEditor from './CodeEditor';

/** The react-ace props CodeEditor sets, which the stub below renders back. */
interface AceProps {
  mode?: string;
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  height?: string;
  minLines?: number;
  maxLines?: number;
  setOptions?: { readOnly?: boolean };
}

// CodeEditor pulls in ace-builds mode/theme files for their side effects; those
// expect the global `ace` that the real react-ace sets up on import. Since we
// mock react-ace below, neutralize those side-effect imports so they don't throw.
vi.mock('ace-builds/src-noconflict/mode-json', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-javascript', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-yaml', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-django', () => ({}));
vi.mock('ace-builds/src-noconflict/theme-twilight', () => ({}));
vi.mock('ace-builds/src-noconflict/ext-searchbox', () => ({}));

// Mock react-ace so the controlled props CodeEditor passes through
// (mode/value/setOptions/onChange) are observable. Under jsdom the real
// react-ace keeps its value in an internal model that never reaches the DOM and
// editing it fires no onChange, so we render those props onto a textarea and
// forward edits to onChange instead.
vi.mock('react-ace', async () => {
  const ReactMock = await vi.importActual<typeof import('react')>('react');
  // class component so CodeEditor's ref (editor.current.refEditor) resolves
  class AceMock extends ReactMock.Component<AceProps> {
    refEditor: HTMLDivElement | null = null;

    render() {
      const {
        mode,
        value,
        onChange,
        setOptions,
        name,
        height,
        minLines,
        maxLines,
      } = this.props;
      return ReactMock.createElement(
        'div',
        {
          ref: (el: HTMLDivElement | null) => {
            this.refEditor = el;
          },
        },
        ReactMock.createElement('textarea', {
          'data-testid': 'ace-editor',
          'data-mode': mode,
          'data-height': height,
          'data-min-lines': minLines,
          'data-max-lines': maxLines,
          name,
          value,
          readOnly: !!(setOptions && setOptions.readOnly),
          onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onChange && onChange(e.target.value),
        })
      );
    }
  }
  return { __esModule: true, default: AceMock };
});

describe('CodeEditor', () => {
  it('should render the ace editor in the requested mode with the given value', () => {
    const onChange = vi.fn();
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
    const onChange = vi.fn();
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
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      renderWithContexts(
        <CodeEditor id="code" value="---" onChange={onChange} mode="yaml" />
      );
      fireEvent.change(screen.getByTestId('ace-editor'), {
        target: { value: '---\nfoo: bar' },
      });
      // CodeEditor wraps onChange in debounce(onChange, 250)
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(onChange).toHaveBeenCalledWith('---\nfoo: bar');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('height', () => {
    // one row is 24px, plus 8px for the margins above and below
    it('is a fixed number of rows by default', () => {
      renderWithContexts(<CodeEditor id="ed" mode="yaml" value="a: 1" />);
      const editor = screen.getByTestId('ace-editor');
      expect(editor).toHaveAttribute('data-height', '152px');
      expect(editor).not.toHaveAttribute('data-min-lines');
      expect(editor).not.toHaveAttribute('data-max-lines');
    });

    it('lets ace size the box to the content in auto mode, never below minRows', () => {
      renderWithContexts(
        <CodeEditor id="ed" mode="yaml" value="a: 1" rows="auto" minRows={4} />
      );
      const editor = screen.getByTestId('ace-editor');
      expect(editor).toHaveAttribute('data-height', 'auto');
      expect(editor).toHaveAttribute('data-min-lines', '4');
      // capped by default, so a long value cannot grow the editor without bound
      expect(editor).toHaveAttribute('data-max-lines', '50');
    });

    it('caps the auto height at maxRows', () => {
      renderWithContexts(
        <CodeEditor
          id="ed"
          mode="yaml"
          value="a: 1"
          rows="auto"
          minRows={4}
          maxRows={12}
        />
      );
      expect(screen.getByTestId('ace-editor')).toHaveAttribute(
        'data-max-lines',
        '12'
      );
    });
  });
});
