import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import SettingList from './SettingList';

vi.mock('../../api');
vi.mock('hooks/useBrandName', () => ({
  __esModule: true,
  default: () => ({
    current: 'AWX',
  }),
}));

describe('<SettingList />', () => {
  test('initially renders without crashing', () => {
    renderWithContexts(<SettingList />);
    expect(screen.getByText('Authentication')).toBeInTheDocument();
  });
});
