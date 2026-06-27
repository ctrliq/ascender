import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import VariablesDetail from './VariablesDetail';

// VariablesDetail renders a YAML/JSON MultiButtonToggle and a read-only
// CodeEditor (react-ace). Under jsdom react-ace's value is held in an internal
// model and never reaches the DOM, so the editor *text* (formatted JSON,
// yaml<->json conversion, "---"/"{}" defaults) is unobservable. The active
// `mode` IS observable: MultiButtonToggle marks the selected button
// variant="primary" -> class pf-m-primary (inactive -> pf-m-secondary). So the
// original `CodeEditor.prop('mode')` checks are asserted via which toggle
// button is primary, and value-content checks are noted as unobservable.

beforeEach(() => {
  document.body.createTextRange = jest.fn();
});

const yamlActive = () =>
  screen.getByRole('button', { name: 'YAML' }).classList.contains('pf-m-primary');
const jsonActive = () =>
  screen.getByRole('button', { name: 'JSON' }).classList.contains('pf-m-primary');

describe('<VariablesDetail>', () => {
  test('should render readonly CodeEditor in yaml mode', () => {
    const { container } = renderWithContexts(
      <VariablesDetail value="---foo: bar" label="Variables" name="test" />
    );
    // a single read-only ace editor is rendered
    const editors = container.querySelectorAll('.ace_editor');
    expect(editors).toHaveLength(1);
    expect(container.querySelector('textarea')).toHaveAttribute('readonly');
    // mode === 'yaml' -> YAML toggle is the active (primary) button
    expect(yamlActive()).toBe(true);
    expect(jsonActive()).toBe(false);
    // NOTE: original also asserted CodeEditor value === '---foo: bar';
    // ace holds its value internally so it is not observable through the DOM.
  });

  test('should detect JSON', () => {
    renderWithContexts(
      <VariablesDetail value='{"foo": "bar"}' label="Variables" name="test" />
    );
    // mode === 'javascript' (JSON) -> JSON toggle is the active button
    expect(jsonActive()).toBe(true);
    expect(yamlActive()).toBe(false);
  });

  // NOTE: original "should format JSON" asserted the CodeEditor value was the
  // pretty-printed '{\n  "foo": "bar"\n}'. That value lives in ace's internal
  // model and is not observable through the DOM, so there is no RTL equivalent.

  test('should convert between modes', async () => {
    const { user } = renderWithContexts(
      <VariablesDetail value="---foo: bar" label="Variables" name="test" />
    );
    expect(yamlActive()).toBe(true);

    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(jsonActive()).toBe(true);
    expect(yamlActive()).toBe(false);

    await user.click(screen.getByRole('button', { name: 'YAML' }));
    expect(yamlActive()).toBe(true);
    expect(jsonActive()).toBe(false);
    // NOTE: original also asserted the converted CodeEditor value in each mode
    // ('{\n  "foo": "bar"\n}' / '---foo: bar'); not observable through ace's DOM.
  });

  test('should render label and an editor when there are no values', () => {
    const { container } = renderWithContexts(
      <VariablesDetail value="" label="Variables" name="test" />
    );
    expect(container.querySelectorAll('.ace_editor')).toHaveLength(1);
    expect(
      container.querySelector('.pf-v6-c-form__label')
    ).toHaveTextContent('Variables');
  });

  test('should preserve the selected mode when the value prop changes', async () => {
    const { user, rerender } = renderWithContexts(
      <VariablesDetail value="---foo: bar" label="Variables" name="test" />
    );
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(jsonActive()).toBe(true);

    rerender(<VariablesDetail value="---bar: baz" label="Variables" name="test" />);
    // mode is preserved (still JSON) after the value prop changes
    expect(jsonActive()).toBe(true);
    // NOTE: original also asserted the recomputed CodeEditor value
    // ('{\n  "bar": "baz"\n}'); ace's value is not observable through the DOM.
  });

  // NOTE: original "should default yaml value to '---'" and "should default
  // empty json to '{}'" asserted the CodeEditor value the empty-state default
  // produces. Those defaults are fed into ace's internal model and do not
  // surface to the DOM, so they have no RTL equivalent; the mode that drives
  // each default is exercised by the tests above.
});
