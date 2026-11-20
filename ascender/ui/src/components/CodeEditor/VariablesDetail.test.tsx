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

/** More lines than the four a collapsed editor shows. */
const LONG_VALUE_LINES = Array.from(
  { length: 8 },
  (_, i) => `key_${i}: value_${i}`
);

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

  test('should disable the collapse toggle for a value that already fits', () => {
    renderWithContexts(
      <VariablesDetail value={'---\nfoo: bar'} label="Variables" name="test" />
    );
    // two lines against a collapsed height of four, so the control keeps its
    // place in the row and is disabled rather than hidden
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDisabled();
  });

  test('should collapse and expand a value taller than the collapsed height', async () => {
    const value = ['---'].concat(LONG_VALUE_LINES).join('\n');
    const { user } = renderWithContexts(
      <VariablesDetail value={value} label="Variables" name="test" />
    );

    const collapse = screen.getByRole('button', { name: 'Collapse' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');

    await user.click(collapse);
    // the same button, now offering the way back, which is how the arrow flips
    const expand = screen.getByRole('button', { name: 'Expand' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: 'Collapse' })
    ).not.toBeInTheDocument();

    await user.click(expand);
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  test('should disable the toggle once a mode change shortens the value', async () => {
    // Commented YAML runs to seven lines and carries one key, so the JSON of it
    // is three. The control does something in one mode and nothing in the
    // other, which is why the count is taken from the value on screen.
    const value = [
      '---',
      '# one',
      '# two',
      '# three',
      '# four',
      '',
      'foo: bar',
    ].join('\n');
    const { user } = renderWithContexts(
      <VariablesDetail value={value} label="Variables" name="test" />
    );
    expect(
      screen.getByRole('button', { name: 'Collapse' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(editorText()).toBe('{\n  "foo": "bar"\n}');
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDisabled();
  });

  test('should copy the value the editor is showing', async () => {
    const { user } = renderWithContexts(
      <VariablesDetail value={'---\nfoo: bar'} label="Variables" name="test" />
    );

    // userEvent.setup() gives the document a clipboard stub of its own, which
    // is the one the button writes into, so read the value back out of it.
    await user.click(screen.getByRole('button', { name: 'Copy to Clipboard' }));
    expect(await navigator.clipboard.readText()).toBe('---\nfoo: bar');

    // the mode toggle decides what lands on the clipboard, not the raw value
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'Copy to Clipboard' }));
    expect(await navigator.clipboard.readText()).toBe('{\n  "foo": "bar"\n}');
  });

  /* The tooltip saying Copied is read out only while the button is pointed
     at, so the copy is also said in a live region, which a screen reader
     announces as it happens. */
  test('should announce a copy', async () => {
    const { user } = renderWithContexts(
      <VariablesDetail value={'---\nfoo: bar'} label="Variables" name="test" />
    );
    expect(screen.getByRole('status')).toHaveTextContent('');

    await user.click(screen.getByRole('button', { name: 'Copy to Clipboard' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  test('should offer a copy button even when there is nothing to collapse', () => {
    renderWithContexts(
      <VariablesDetail value="---foo: bar" label="Variables" name="test" />
    );
    // one line, so collapsing is disabled, but copying a one line value is
    // worth as much as copying a long one
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Copy to Clipboard' })
    ).toBeEnabled();
  });

  test('should disable the height button for a value that already fits', () => {
    renderWithContexts(
      <VariablesDetail value="---foo: bar" label="Variables" name="test" />
    );
    expect(
      screen.getByRole('button', { name: 'Set the number of lines shown' })
    ).toBeDisabled();
  });

  test('should open the height modal on the height the editor is showing', async () => {
    const value = ['---'].concat(LONG_VALUE_LINES).join('\n');
    const { user } = renderWithContexts(
      <VariablesDetail value={value} label="Variables" name="test" />
    );

    await user.click(
      screen.getByRole('button', { name: 'Set the number of lines shown' })
    );
    // nine lines, so the field opens on the height the box is showing
    const field = screen.getByRole('spinbutton', { name: 'Lines to Show' });
    expect(field).toHaveValue(9);
  });

  test('should take a height larger than the value and refuse one below one', async () => {
    const value = ['---'].concat(LONG_VALUE_LINES).join('\n');
    const { user } = renderWithContexts(
      <VariablesDetail value={value} label="Variables" name="test" />
    );
    await user.click(
      screen.getByRole('button', { name: 'Set the number of lines shown' })
    );

    const field = screen.getByRole('spinbutton', { name: 'Lines to Show' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();

    // below the floor
    await user.clear(field);
    await user.type(field, '0');
    expect(save).toBeDisabled();

    // an emptied field is not a zero
    await user.clear(field);
    expect(save).toBeDisabled();

    // there is no ceiling: a height past the value's own length and past the
    // cap on the auto height is the reader's to ask for
    await user.clear(field);
    await user.type(field, '500');
    expect(save).toBeEnabled();
  });

  test('should close the height modal on cancel and on save', async () => {
    const value = ['---'].concat(LONG_VALUE_LINES).join('\n');
    const { user } = renderWithContexts(
      <VariablesDetail value={value} label="Variables" name="test" />
    );
    const open = () =>
      user.click(
        screen.getByRole('button', { name: 'Set the number of lines shown' })
      );

    await open();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('spinbutton', { name: 'Lines to Show' })
    ).not.toBeInTheDocument();

    await open();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.queryByRole('spinbutton', { name: 'Lines to Show' })
    ).not.toBeInTheDocument();
  });

  test('should leave the collapse arrow working after a height is chosen', async () => {
    const value = ['---'].concat(LONG_VALUE_LINES).join('\n');
    const { user } = renderWithContexts(
      <VariablesDetail value={value} label="Variables" name="test" />
    );

    // collapse first, then choose a height: choosing one is itself an expand,
    // so the arrow has to come back offering to collapse
    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Set the number of lines shown' })
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByRole('button', { name: 'Collapse' })
    ).toBeInTheDocument();
  });

  test('should give each editor on a page its own toggle', async () => {
    // The job detail page renders one of these for Variables and another for
    // Artifacts, so collapsing one must leave the other where it was.
    const value = ['---'].concat(LONG_VALUE_LINES).join('\n');
    const { user } = renderWithContexts(
      <>
        <VariablesDetail
          value={value}
          label="Variables"
          name="extra_vars"
          dataCy="vars"
        />
        <VariablesDetail
          value={value}
          label="Artifacts"
          name="artifacts"
          dataCy="arts"
        />
      </>
    );
    expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(2);

    await user.click(
      document.querySelector('[data-cy="vars-collapse-toggle"]') as HTMLElement
    );
    // one collapsed, one still expanded
    expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
    expect(
      document.querySelector('[data-cy="arts-collapse-toggle"]')
    ).toHaveAttribute('aria-expanded', 'true');
  });
});
