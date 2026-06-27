import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { RootAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import DetailsStep from './AdHocDetailsStep';

jest.mock('../../api/models/Credentials');
jest.mock('../../api/models/Root');

const verbosityOptions = [
  { key: -1, value: '', label: '', isDisabled: false },
  { key: 0, value: 0, label: '0', isDisabled: false },
  { key: 1, value: 1, label: '1', isDisabled: false },
];
const moduleOptions = [
  ['command', 'command'],
  ['shell', 'shell'],
];
const onLimitChange = jest.fn();
const initialValues = {
  limit: ['Inventory 1', 'inventory 2'],
  credential: [],
  module_args: '',
  arguments: '',
  verbosity: '',
  forks: 0,
  changes: false,
  escalation: false,
  extra_vars: '---',
  module_name: 'shell',
};

function renderStep() {
  return renderWithContexts(
    <Formik initialValues={initialValues}>
      <DetailsStep
        verbosityOptions={verbosityOptions}
        moduleOptions={moduleOptions}
        onLimitChange={onLimitChange}
      />
    </Formik>
  );
}

describe('<AdHocDetailsStep />', () => {
  beforeEach(() => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
  });

  test('should mount properly', async () => {
    renderStep();
    // the Module select is the first field rendered by the step
    await waitFor(() =>
      expect(document.querySelector('#module_name')).toBeInTheDocument()
    );
  });

  test('should show all the fields', async () => {
    renderStep();
    await waitFor(() =>
      expect(document.querySelector('#module_name')).toBeInTheDocument()
    );
    // FormField labelIcons break getByLabelText, so query the inputs by id
    expect(document.querySelector('#module_name')).toBeInTheDocument(); // Module
    expect(document.querySelector('#module_args')).toBeInTheDocument(); // Arguments
    expect(document.querySelector('#verbosity')).toBeInTheDocument(); // Verbosity
    expect(document.querySelector('#limit')).toBeInTheDocument(); // Limit
    expect(document.querySelector('#template-forks')).toBeInTheDocument(); // forks
    expect(screen.getByText('Show changes')).toBeInTheDocument();
    expect(document.querySelector('#become_enabled')).toBeInTheDocument();
    // VariablesField (react-ace) renders empty under jsdom; assert its label
    expect(screen.getByText('Extra variables')).toBeInTheDocument();
  });

  test('should update form values', async () => {
    const { user } = renderStep();
    await waitFor(() =>
      expect(document.querySelector('#module_name')).toBeInTheDocument()
    );

    const moduleSelect = document.querySelector('#module_name');
    const argsInput = document.querySelector('#module_args');
    const limitInput = document.querySelector('#limit');
    const verbositySelect = document.querySelector('#verbosity');
    const forksInput = document.querySelector('#template-forks');

    await user.selectOptions(moduleSelect, 'command');
    await user.clear(argsInput);
    await user.type(argsInput, 'foo');
    await user.clear(limitInput);
    await user.type(limitInput, 'Inventory 1, inventory 2, new inventory');
    // select verbosity by its stable option value ('1'), not the i18n label
    await user.selectOptions(verbositySelect, '1');
    await user.clear(forksInput);
    await user.type(forksInput, '10');

    // diff_mode Switch renders a checkbox input with aria-label "toggle changes"
    const diffSwitch = screen.getByRole('switch', { name: 'toggle changes' });
    await user.click(diffSwitch);

    const becomeCheckbox = screen.getByRole('checkbox', {
      name: 'Enable privilege escalation',
    });
    await user.click(becomeCheckbox);

    await waitFor(() => expect(moduleSelect).toHaveValue('command'));
    expect(argsInput).toHaveValue('foo');
    expect(verbositySelect).toHaveValue('1');
    expect(forksInput).toHaveValue(10);
    expect(limitInput).toHaveValue('Inventory 1, inventory 2, new inventory');
    expect(diffSwitch).toBeChecked();
    expect(becomeCheckbox).toBeChecked();
  });
});
