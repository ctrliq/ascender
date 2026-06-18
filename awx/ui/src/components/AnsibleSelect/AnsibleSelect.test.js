import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AnsibleSelect from './AnsibleSelect';

const mockData = [
  {
    key: 'baz',
    label: 'Baz',
    value: '/var/lib/awx/venv/baz/',
  },
  {
    key: 'default',
    label: 'Default',
    value: '/var/lib/awx/venv/ansible/',
  },
];

describe('<AnsibleSelect />', () => {
  test('initially renders successfully', () => {
    renderWithContexts(
      <AnsibleSelect
        id="bar"
        value="foo"
        name="bar"
        onChange={() => {}}
        data={mockData}
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('calls "onChange" on dropdown select change', async () => {
    const onChange = jest.fn();
    const { user } = renderWithContexts(
      <AnsibleSelect
        id="bar"
        value="/var/lib/awx/venv/baz/"
        name="bar"
        onChange={onChange}
        data={mockData}
      />
    );
    expect(onChange).not.toHaveBeenCalled();
    await user.selectOptions(
      screen.getByRole('combobox'),
      '/var/lib/awx/venv/ansible/'
    );
    expect(onChange).toHaveBeenCalled();
    // onSelectChange forwards (event, value); the selected value is the option.
    const [, value] = onChange.mock.calls[0];
    expect(value).toEqual('/var/lib/awx/venv/ansible/');
  });

  test('Returns correct select options', () => {
    renderWithContexts(
      <AnsibleSelect
        id="bar"
        value="foo"
        name="bar"
        onChange={() => {}}
        data={mockData}
      />
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.textContent)).toEqual(['Baz', 'Default']);
  });
});
