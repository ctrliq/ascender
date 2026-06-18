import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import RADIUSDetail from './RADIUSDetail';

jest.mock('../../../../api');

describe('<RADIUSDetail />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        RADIUS_SERVER: 'example.org',
        RADIUS_PORT: 1812,
        RADIUS_SECRET: '$encrypted$',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderDetail(context) {
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <RADIUSDetail />
      </SettingsProvider>,
      context
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await renderDetail();
    expect(screen.getByText('RADIUS Server')).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    await renderDetail();
    expect(
      screen.getAllByRole('tab', { name: /Back to Settings/ }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('tab', { name: /Details/ }).length
    ).toBeGreaterThan(0);
  });

  test('should render expected details', async () => {
    await renderDetail();
    expect(
      screen.getByText(
        'This feature is deprecated and will be removed in a future release.'
      )
    ).toBeInTheDocument();
    assertDetail('RADIUS Server', 'example.org');
    assertDetail('RADIUS Port', '1812');
    assertDetail('RADIUS Secret', 'Encrypted');
  });

  test('should hide edit button from non-superusers', async () => {
    await renderDetail({
      context: { config: { me: { is_superuser: false } } },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  test('should display content error when api throws error on initial render', async () => {
    SettingsAPI.readCategory.mockRejectedValue(new Error());
    await renderDetail();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
