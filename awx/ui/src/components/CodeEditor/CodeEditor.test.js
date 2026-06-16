import React from 'react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import CodeEditor from './CodeEditor';

// CodeEditor wraps react-ace. Under jsdom react-ace renders an .ace_editor
// container with a hidden <textarea>, but the editor's value lives in an
// internal model and is NOT mirrored to that textarea (textarea.value stays
// ""), and changing the textarea does not fire onChange. So the controlled
// `value` and `onChange` props are unobservable through the DOM here. We assert
// the props that DO surface: the editor container/textarea presence, the
// textarea id (CodeEditor copies its `id` prop onto the textarea), and the
// readOnly state (textarea[readonly]). react-ace also needs
// document.body.createTextRange under jsdom (carried over from the enzyme test).

describe('CodeEditor', () => {
  beforeEach(() => {
    document.body.createTextRange = jest.fn();
  });

  it('should render the ace editor in the requested mode', () => {
    const onChange = jest.fn();
    const { container } = renderWithContexts(
      <CodeEditor
        id="code"
        value={'---\nfoo: bar'}
        onChange={onChange}
        mode="yaml"
      />
    );
    // editor container + hidden textarea are rendered
    expect(container.querySelector('.ace_editor')).toBeInTheDocument();
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeInTheDocument();
    // CodeEditor copies its `id` prop onto the editor textarea
    expect(textarea).toHaveAttribute('id', 'code');
    // not read only -> textarea is editable
    expect(textarea).not.toHaveAttribute('readonly');
    // NOTE: the original enzyme test also asserted the ace `value` and `mode`
    // props; neither surfaces to the DOM under jsdom (value is held in ace's
    // internal model, mode produces no observable attribute), so they cannot be
    // asserted here.
  });

  it('should render in read only mode', () => {
    const onChange = jest.fn();
    const { container } = renderWithContexts(
      <CodeEditor
        id="code"
        value="---"
        onChange={onChange}
        mode="yaml"
        readOnly
      />
    );
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeInTheDocument();
    // readOnly prop surfaces as the textarea[readonly] attribute
    expect(textarea).toHaveAttribute('readonly');
    // NOTE: the original enzyme test also asserted the ace `value` prop, which
    // is held in ace's internal model and not observable through the DOM.
  });

  // NOTE: the original enzyme test "should trigger onChange prop" drove the ace
  // editor's onChange directly via the React prop. Under jsdom react-ace does
  // not mirror edits to the hidden textarea, so there is no DOM event that
  // reaches onChange; this behaviour is not observable through the rendered DOM
  // and the assertion has no RTL equivalent.
});
