import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { LabelsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import LabelSelect from './LabelSelect';

jest.mock('../../api');

const options = [
  { id: 1, name: 'one' },
  { id: 2, name: 'two' },
];

async function openAndGetOptions(user) {
  const input = screen.getByRole('textbox', { name: 'Select Labels' });
  await user.click(input);
  const listbox = await screen.findByRole('listbox');
  return within(listbox).getAllByRole('menuitem');
}

describe('<LabelSelect />', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should fetch labels', async () => {
    LabelsAPI.read.mockResolvedValue({
      data: { results: options },
    });
    const { user } = renderWithContexts(
      <LabelSelect value={[]} onError={() => {}} onChange={() => {}} />
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Select Labels' })).toBeEnabled()
    );
    expect(LabelsAPI.read).toHaveBeenCalledTimes(1);

    const selectOptions = await openAndGetOptions(user);
    expect(selectOptions).toHaveLength(2);
    expect(selectOptions[0]).toHaveTextContent('one');
    expect(selectOptions[1]).toHaveTextContent('two');
  });

  test('should fetch two pages labels if present', async () => {
    LabelsAPI.read.mockResolvedValueOnce({
      data: {
        results: options,
        next: '/foo?page=2',
      },
    });
    LabelsAPI.read.mockResolvedValueOnce({
      data: {
        results: [
          { id: 3, name: 'three' },
          { id: 4, name: 'four' },
        ],
      },
    });
    const { user } = renderWithContexts(
      <LabelSelect value={[]} onError={() => {}} onChange={() => {}} />
    );

    await waitFor(() => expect(LabelsAPI.read).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Select Labels' })).toBeEnabled()
    );

    const selectOptions = await openAndGetOptions(user);
    expect(selectOptions).toHaveLength(4);
  });

  test('Generate a label', async () => {
    const onChange = jest.fn();
    LabelsAPI.read.mockResolvedValue({
      data: {
        results: options,
      },
    });
    const { user } = renderWithContexts(
      <LabelSelect value={[]} onError={() => {}} onChange={onChange} />
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Select Labels' })).toBeEnabled()
    );

    const input = screen.getByRole('textbox', { name: 'Select Labels' });
    await user.type(input, 'foo');
    const createOption = await screen.findByText(/foo/);
    await user.click(createOption);

    expect(onChange).toHaveBeenCalledWith([{ id: 'foo', name: 'foo' }]);
  });

  test('should handle read-only labels', async () => {
    const onChange = jest.fn();
    LabelsAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'read only' },
          { id: 2, name: 'not read only' },
        ],
      },
    });
    const { user } = renderWithContexts(
      <LabelSelect
        value={[
          { id: 1, name: 'read only', isReadOnly: true },
          { id: 2, name: 'not read only' },
        ]}
        onError={() => {}}
        onChange={onChange}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Select Labels' })).toBeEnabled()
    );

    const selectOptions = await openAndGetOptions(user);
    expect(selectOptions).toHaveLength(2);
    expect(selectOptions[0]).toHaveClass('pf-m-disabled');
    expect(selectOptions[1]).not.toHaveClass('pf-m-disabled');
  });
});
