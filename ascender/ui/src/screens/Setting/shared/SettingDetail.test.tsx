import React from 'react';
import { screen } from '@testing-library/react';
import {
  assertDetail,
  renderWithContexts,
} from '../../../../testUtils/rtlContexts';
import SettingDetail from './SettingDetail';
import { formatDuration } from './settingUtils';

describe('<SettingDetail />', () => {
  /**
   * The list and object cases render a code box, which opens at the height of
   * its value, capped by MAX_UI_EDITOR_ROWS the way every other editor is, and
   * collapses to four rows from the arrow beside the label. A value that fits
   * in four rows has nothing to size, so the arrow is disabled.
   */
  function renderList(value: string[]) {
    return renderWithContexts(
      <SettingDetail
        id="LOG_AGGREGATOR_LOGGERS"
        label="Loggers Sending Data to Log Aggregator Form"
        type="list"
        value={value}
      />
    );
  }

  test('opens a long value fitted, and the arrow collapses it', async () => {
    const { user } = renderList([
      'awx',
      'activity_stream',
      'job_events',
      'system_tracking',
      'broadcast_websocket',
    ]);

    const toggle = screen.getByRole('button', { name: 'Collapse' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toBeEnabled();

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  test('leaves a value that already fits with nothing to expand', () => {
    renderList(['awx']);

    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDisabled();
  });

  test.each([
    ['nested object', null],
    ['nested object', {}],
    ['list', null],
    ['certificate', ''],
  ])('reads a %s holding %j as not configured', (type, value) => {
    renderWithContexts(
      <SettingDetail id="X" label="A setting" type={type} value={value} />
    );
    assertDetail('A setting', 'Not configured');
    expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull();
  });

  test('keeps an empty list in the box, where it means none', () => {
    renderWithContexts(
      <SettingDetail id="X" label="A setting" type="list" value={[]} />
    );
    expect(screen.queryByText('Not configured')).toBeNull();
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDisabled();
  });

  test('reads a value that lifts a limit as unlimited', () => {
    renderWithContexts(
      <SettingDetail
        id="X"
        label="Sessions"
        type="integer"
        unlimitedValue={-1}
        value={-1}
      />
    );
    assertDetail('Sessions', 'Unlimited');
  });

  test('reads a count of seconds as a length of time', () => {
    expect(formatDuration(31536000000)).toBe(
      '1,000 years (31,536,000,000 seconds)'
    );
    expect(formatDuration(7200)).toBe('2 hours (7,200 seconds)');
    expect(formatDuration(90)).toBe('90 seconds');
    expect(formatDuration(1)).toBe('1 second');
  });

  test('breaks an address at its slashes', () => {
    const url = 'https://old-deployment.example.com/sso/complete/saml/';
    renderWithContexts(
      <SettingDetail id="X" label="Callback" type="string" value={url} />
    );
    const value = screen.getByText('Callback').nextElementSibling;
    expect(value).toHaveTextContent(url);
    expect(
      [...(value?.children ?? [])].map((part) => part.textContent)
    ).toEqual([
      'https://',
      'old-deployment.example.com/',
      'sso/',
      'complete/',
      'saml/',
    ]);
  });
});
