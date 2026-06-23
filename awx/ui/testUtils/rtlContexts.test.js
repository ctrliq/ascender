import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { useNavigate, useLocation } from 'react-router';
import { Plural } from '@lingui/react/macro';
import { useConfig } from '../src/contexts/Config';
import { useSession } from '../src/contexts/Session';
import { renderWithContexts } from './rtlContexts';

function ConfigProbe() {
  const config = useConfig();
  return (
    <div>
      <span>{config.me.is_superuser ? 'superuser' : 'normal user'}</span>
      <span>{config.custom_field ?? 'no custom field'}</span>
    </div>
  );
}

function SessionProbe() {
  const { isSessionExpired } = useSession();
  return <span>{isSessionExpired ? 'expired' : 'active'}</span>;
}

function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/somewhere-else')}>
      {location.pathname}
    </button>
  );
}

function CompatRouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/compat-target')}>
      {location.pathname}
    </button>
  );
}

describe('renderWithContexts', () => {
  test('provides the default config context', () => {
    renderWithContexts(<ConfigProbe />);
    expect(screen.getByText('superuser')).toBeInTheDocument();
    expect(screen.getByText('no custom field')).toBeInTheDocument();
  });

  test('merges config overrides into the defaults', () => {
    renderWithContexts(<ConfigProbe />, {
      context: { config: { me: { is_superuser: false }, custom_field: 'qux' } },
    });
    expect(screen.getByText('normal user')).toBeInTheDocument();
    expect(screen.getByText('qux')).toBeInTheDocument();
  });

  test('provides the default session context', () => {
    renderWithContexts(<SessionProbe />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  test('returns the router history it renders with', async () => {
    const { history, user } = renderWithContexts(<RouterProbe />);
    expect(screen.getByRole('button')).toHaveTextContent('/');
    await user.click(screen.getByRole('button'));
    expect(history.location.pathname).toBe('/somewhere-else');
    expect(screen.getByRole('button')).toHaveTextContent('/somewhere-else');
  });

  test('uses a caller-supplied history', () => {
    const history = createMemoryHistory({ initialEntries: ['/credentials'] });
    renderWithContexts(<RouterProbe />, { context: { router: { history } } });
    expect(screen.getByRole('button')).toHaveTextContent('/credentials');
  });

  test('supports the react-router-dom hooks', async () => {
    const { history, user } = renderWithContexts(<CompatRouterProbe />);
    expect(screen.getByRole('button')).toHaveTextContent('/');
    await user.click(screen.getByRole('button'));
    expect(history.location.pathname).toBe('/compat-target');
    expect(screen.getByRole('button')).toHaveTextContent('/compat-target');
  });

  test('renders plural messages without console errors', () => {
    renderWithContexts(
      <Plural value={2} one="# item" other="# items" />
    );
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });
});
