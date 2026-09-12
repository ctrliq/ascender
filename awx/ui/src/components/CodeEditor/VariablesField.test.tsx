import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import VariablesField from './VariablesField';

// VariablesField renders a YAML/JSON MultiButtonToggle plus a CodeEditor. The
// editor keeps its document in the DOM, one element per line, so both the text
// it shows and the edits made to it are observable: editorText() reads it back
// and typing into it drives the field's onChange into Formik.

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

const yamlBtn = () => screen.getByRole('button', { name: 'YAML' });
const jsonBtn = () => screen.getByRole('button', { name: 'JSON' });
const isPrimary = (btn: HTMLElement) => btn.classList.contains('pf-m-primary');

describe('VariablesField', () => {
  it('should render code editor', () => {
    const { container } = renderWithContexts(
      <Formik onSubmit={() => {}} initialValues={{ variables: '---\n' }}>
        {() => (
          <VariablesField id="the-field" name="variables" label="Variables" />
        )}
      </Formik>
    );
    expect(container.querySelector('.cm-editor')).toBeInTheDocument();
    expect(editorText()).toBe('---\n');
    // starts in YAML mode
    expect(isPrimary(yamlBtn())).toBe(true);
  });

  it('should toggle between yaml/json', async () => {
    const { user } = renderWithContexts(
      <Formik
        onSubmit={() => {}}
        initialValues={{ variables: '---\nfoo: bar\nbaz: 3' }}
      >
        {() => (
          <VariablesField id="the-field" name="variables" label="Variables" />
        )}
      </Formik>
    );
    // YAML active to start
    expect(isPrimary(yamlBtn())).toBe(true);
    expect(isPrimary(jsonBtn())).toBe(false);

    await user.click(jsonBtn());
    expect(isPrimary(jsonBtn())).toBe(true);
    expect(isPrimary(yamlBtn())).toBe(false);
    expect(editorText()).toBe('{\n  "foo": "bar",\n  "baz": 3\n}');

    await user.click(yamlBtn());
    expect(isPrimary(yamlBtn())).toBe(true);
    expect(isPrimary(jsonBtn())).toBe(false);
    expect(editorText()).toBe('---\nfoo: bar\nbaz: 3');
  });

  it('should retain yaml if the JSON value is not edited', async () => {
    // anchors and aliases have no JSON form, so a round trip through JSON has
    // to give the original yaml back rather than the expansion of it
    const yamlValue = '---\na: &aa [a,b,c]\nb: *aa';
    const { user, container } = renderWithContexts(
      <Formik onSubmit={() => {}} initialValues={{ variables: yamlValue }}>
        {() => (
          <VariablesField id="the-field" name="variables" label="Variables" />
        )}
      </Formik>
    );
    await user.click(jsonBtn());
    await user.click(yamlBtn());
    expect(isPrimary(yamlBtn())).toBe(true);
    expect(container.querySelector('.pf-m-error')).not.toBeInTheDocument();
    expect(editorText()).toBe(yamlValue);
  });

  it('should set Formik error if yaml is invalid', async () => {
    const { user, container } = renderWithContexts(
      <Formik
        onSubmit={() => {}}
        initialValues={{ variables: '---\nfoo bar\n' }}
      >
        {() => (
          <VariablesField id="the-field" name="variables" label="Variables" />
        )}
      </Formik>
    );
    // switching the invalid yaml to JSON mode raises a conversion error
    await user.click(jsonBtn());
    await waitFor(() =>
      expect(container.querySelector('.pf-m-error')).toBeInTheDocument()
    );
    // hasErrors surfaces on the editor wrapper as the invalid form-control class
    expect(container.querySelector('.pf-m-error')).toBeInTheDocument();
  });

  it('should render tooltip', () => {
    renderWithContexts(
      <Formik onSubmit={() => {}} initialValues={{ variables: '---\n' }}>
        {() => (
          <VariablesField
            id="the-field"
            name="variables"
            label="Variables"
            tooltip="This is a tooltip"
          />
        )}
      </Formik>
    );
    // the Popover renders its help-icon trigger button when a tooltip is passed
    expect(
      screen.getByRole('button', { name: 'More information' })
    ).toBeInTheDocument();
  });

  it('should submit an edited value through Formik', async () => {
    const handleSubmit = vi.fn();
    const { user } = renderWithContexts(
      <Formik initialValues={{ variables: 'foo: bar' }} onSubmit={handleSubmit}>
        {(formik) => (
          <form onSubmit={formik.handleSubmit}>
            <VariablesField id="the-field" name="variables" label="Variables" />
            <button type="submit" id="submit">
              Submit
            </button>
          </form>
        )}
      </Formik>
    );

    // type in the editor, which drives onChange into Formik after the debounce
    await user.click(document.querySelector('.cm-content') as HTMLElement);
    await user.keyboard('{Control>}a{/Control}');
    await user.keyboard('foo: baz');
    expect(editorText()).toBe('foo: baz');

    // the editor's onChange is debounced, so let it reach Formik before submit
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
    });

    await user.click(screen.getByText('Submit'));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalled());
    expect(handleSubmit.mock.calls[0]![0]).toEqual({ variables: 'foo: baz' });
  });

  it('should initialize to JSON if value is JSON, formatted', async () => {
    renderWithContexts(
      <Formik
        initialValues={{ variables: '{"foo": "bar"}' }}
        onSubmit={vi.fn()}
      >
        {() => (
          <VariablesField id="the-field" name="variables" label="Variables" />
        )}
      </Formik>
    );
    // a JSON initial value starts the field in JSON mode; the JSON-formatting
    // effect runs on mount, so wait for the mode to settle (also flushes the
    // effect's setValue inside act).
    await waitFor(() => expect(isPrimary(jsonBtn())).toBe(true));
    expect(isPrimary(yamlBtn())).toBe(false);
    expect(editorText()).toBe('{\n  "foo": "bar"\n}');
  });

  it('offers no expand button: the editor grows with its content', () => {
    renderWithContexts(
      <Formik initialValues={{ variables: '---' }} onSubmit={vi.fn()}>
        {() => (
          <VariablesField id="the-field" name="variables" label="Variables" />
        )}
      </Formik>
    );
    expect(
      screen.queryByRole('button', { name: 'Expand input' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
