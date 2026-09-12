import React from 'react';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import CodeEditor from './CodeEditor';

const content = () => document.querySelector('.cm-content') as HTMLElement;

describe('CodeEditor', () => {
  it('should render the value, one line per line', () => {
    renderWithContexts(
      <CodeEditor id="code" value={'---\nfoo: bar'} mode="yaml" />
    );
    expect(content()).toBeInTheDocument();
    expect(content().textContent).toBe('---foo: bar');
    expect(document.querySelectorAll('.cm-line')).toHaveLength(2);
  });

  it('should be editable by default and carry the id it was given', () => {
    renderWithContexts(<CodeEditor id="code" value="---" mode="yaml" />);
    expect(content()).toHaveAttribute('contenteditable', 'true');
    expect(content()).toHaveAttribute('id', 'code');
    expect(content()).toHaveAttribute('role', 'textbox');
  });

  it('should render in read only mode', () => {
    renderWithContexts(
      <CodeEditor id="code" value="---" mode="yaml" readOnly />
    );
    expect(content()).toHaveAttribute('contenteditable', 'false');
  });

  it('should replace the document when the value changes from outside', () => {
    const { rerender } = renderWithContexts(
      <CodeEditor id="code" value="one: 1" mode="yaml" />
    );
    expect(content().textContent).toBe('one: 1');
    rerender(<CodeEditor id="code" value="two: 2" mode="yaml" />);
    expect(content().textContent).toBe('two: 2');
  });

  it('should trigger the onChange prop (debounced) on edit', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithContexts(
      <CodeEditor id="code" value="" onChange={onChange} mode="yaml" />
    );

    await user.click(content());
    await user.keyboard('hi');

    expect(onChange).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
    });
    expect(onChange).toHaveBeenCalledWith('hi');
  });

  it('should name itself after the label that points at it', () => {
    renderWithContexts(
      <>
        <label htmlFor="code">Variables</label>
        <CodeEditor id="code" value="---" mode="yaml" />
      </>
    );
    const label = document.querySelector('label') as HTMLLabelElement;
    expect(content()).toHaveAttribute('aria-labelledby', label.id);
    expect(label.id).toBeTruthy();
  });

  it('should fall back to a generic name where no label points at it', () => {
    renderWithContexts(<CodeEditor id="lonely" value="---" mode="yaml" />);
    expect(content()).toHaveAttribute('aria-label', 'Code editor');
  });

  describe('height', () => {
    // one row is 24px, plus 8px for the margins above and below
    const scroller = () =>
      window.getComputedStyle(
        document.querySelector('.cm-scroller') as HTMLElement
      );

    it('is a fixed number of rows by default', () => {
      renderWithContexts(<CodeEditor id="ed" mode="yaml" value="a: 1" />);
      expect(scroller().height).toBe('152px');
    });

    it('sizes the box to the content in auto mode, never below minRows', () => {
      renderWithContexts(
        <CodeEditor id="ed" mode="yaml" value="a: 1" rows="auto" minRows={4} />
      );
      expect(scroller().minHeight).toBe('104px');
      // capped by default, so a long value cannot grow the editor without bound
      expect(scroller().maxHeight).toBe('1208px');
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
      expect(scroller().maxHeight).toBe('296px');
    });
  });
});
