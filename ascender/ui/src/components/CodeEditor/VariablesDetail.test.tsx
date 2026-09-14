import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import VariablesDetail from './VariablesDetail';

// VariablesDetail renders a YAML/JSON MultiButtonToggle and a read-only
// CodeEditor. The editor holds its document in the DOM, one element per line,
// so the text it shows is assertable: editorText() reads it back. The active
// `mode` is observable too, through MultiButtonToggle marking the selected
// button variant="primary" -> class pf-m-primary (inactive -> pf-m-secondary).

beforeEach(() => {
  (
    document.body as unknown as { createTextRange: () => void }
  ).createTextRange = vi.fn();
});

/** The editor's document, read back out of the DOM one line at a time. */
const editorText = () =>
  Array.from(document.querySelectorAll('.cm-line'))
    .map((line) => (line.textContent ?? '').replace(/\u00a0/g, ' '))
    .join('\n');

const yamlActive = () =>
  screen
    .getByRole('button', { name: 'YAML' })
    .classList.contains('pf-m-primary');
const jsonActive = () =>
  screen
    .getByRole('button', { name: 'JSON' })
    .classList.contains('pf-m-primary');

describe('<VariablesDetail>', () => {
  test('should render readonly CodeEditor in yaml mode', () => {
    const { container } = renderWithContexts(
      <VariablesDetail value="---foo: bar" label="Variables" name="test" />
    );
    // a single read-only editor is rendered, showing the value it was given
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(1);
    expect(container.querySelector('.cm-content')).toHaveAttribute(
      'contenteditable',
      'false'
    );
    expect(editorText()).toBe('---foo: bar');
    // mode === 'yaml' -> YAML toggle is the active (primary) button
    expect(yamlActive()).toBe(true);
    expect(jsonActive()).toBe(false);
  });

  test('should detect JSON', () => {
    renderWithContexts(
      <VariablesDetail value='{"foo": "bar"}' label="Variables" name="test" />
    );
    // mode === 'javascript' (JSON) -> JSON toggle is the active button
    expect(jsonActive()).toBe(true);
    expect(yamlActive()).toBe(false);
  });

  test('should format JSON', () => {
    renderWithContexts(
      <VariablesDetail value='{"foo": "bar"}' label="Variables" name="test" />
    );
    expect(editorText()).toBe('{\n  "foo": "bar"\n}');
  });

  test('should convert between modes', async () => {
    const { user } = renderWithContexts(
      <VariablesDetail value="---foo: bar" label="Variables" name="test" />
    );
    expect(yamlActive()).toBe(true);

    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(jsonActive()).toBe(true);
    expect(yamlActive()).toBe(false);
    // the fixture is a single line, so yaml reads '---foo' as the key
    expect(editorText()).toBe('{\n  "---foo": "bar"\n}');

    await user.click(screen.getByRole('button', { name: 'YAML' }));
    expect(yamlActive()).toBe(true);
    expect(jsonActive()).toBe(false);
    expect(editorText()).toBe('---foo: bar');
  });

  test('should render label and an editor when there are no values', () => {
    const { container } = renderWithContexts(
      <VariablesDetail value="" label="Variables" name="test" />
    );
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(1);
    expect(container.querySelector('.pf-v6-c-form__label')).toHaveTextContent(
      'Variables'
    );
  });

  test('should default an empty yaml value to ---', () => {
    renderWithContexts(
      <VariablesDetail value="" label="Variables" name="test" />
    );
    expect(yamlActive()).toBe(true);
    expect(editorText()).toBe('---');
  });

  test('should default an empty json value to {}', async () => {
    const { user } = renderWithContexts(
      <VariablesDetail value="" label="Variables" name="test" />
    );
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(jsonActive()).toBe(true);
    expect(editorText()).toBe('{}');
  });

  test('offers no expand button: the editor grows with its content', () => {
    renderWithContexts(
      <VariablesDetail value="---\nfoo: bar" label="Variables" name="test" />
    );
    expect(
      screen.queryByRole('button', { name: 'Expand input' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('should preserve the selected mode when the value prop changes', async () => {
    const { user, rerender } = renderWithContexts(
      <VariablesDetail value="---foo: bar" label="Variables" name="test" />
    );
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(jsonActive()).toBe(true);

    rerender(
      <VariablesDetail value="---bar: baz" label="Variables" name="test" />
    );
    // mode is preserved (still JSON) after the value prop changes, and the new
    // value is converted into it
    expect(jsonActive()).toBe(true);
    expect(editorText()).toBe('{\n  "---bar": "baz"\n}');
  });
});
