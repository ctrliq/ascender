import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import LaunchDaysPrompt, { parseDays } from './LaunchDaysPrompt';

describe('parseDays', () => {
  test.each([
    ['30', 30],
    ['0', 0],
    [' 7 ', 7],
    ['99999', 99999],
    ['', null],
    ['-1', null],
    ['1.5', null],
    ['abc', null],
    ['100000', null],
  ])('reads %j as %j', (value, expected) => {
    expect(parseDays(value)).toBe(expected);
  });
});

describe('<LaunchDaysPrompt />', () => {
  test('holds Run back until a valid number is entered', async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <LaunchDaysPrompt onClose={() => {}} onConfirm={onConfirm} />
    );
    const input = screen.getByLabelText('Days of Data to Keep');
    const run = screen.getByRole('button', { name: 'Run' });

    await user.clear(input);
    expect(run).toBeDisabled();
    expect(
      screen.getByText('Enter a whole number of days from 0 to 99999.')
    ).toBeInTheDocument();

    await user.type(input, '14');
    expect(run).toBeEnabled();
    await user.click(run);
    expect(onConfirm).toHaveBeenCalledWith(14);
  });

  test('counts the jobs in its title', () => {
    const { unmount } = renderWithContexts(
      <LaunchDaysPrompt onClose={() => {}} onConfirm={() => {}} />
    );
    expect(
      screen.getByRole('dialog', { name: /Run Cleanup Job$/ })
    ).toBeInTheDocument();
    unmount();

    renderWithContexts(
      <LaunchDaysPrompt onClose={() => {}} onConfirm={() => {}} jobCount={2} />
    );
    expect(
      screen.getByRole('dialog', { name: /Run Cleanup Jobs/ })
    ).toBeInTheDocument();
  });
});
