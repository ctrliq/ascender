import { createMemoryHistory } from 'history';
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ResourceTabs, { isUnder } from './ResourceTabs';

const tabs = [
  { label: 'Credentials', path: '/credentials' },
  { label: 'Credential types', path: '/credential_types' },
];

function renderTabs(at: string) {
  const history = createMemoryHistory({ initialEntries: [at] });
  return {
    ...renderWithContexts(
      <ResourceTabs
        aria-label="Credential tabs"
        ouiaId="credential-tabs"
        tabs={tabs}
      />,
      { context: { router: { history } } }
    ),
    history,
  };
}

describe('ResourceTabs', () => {
  /*
   * Each tab is a route, so which one is open is in the address bar: a link
   * into either lands on it, and the back button walks between them.
   */
  test('should open the tab the address bar names', () => {
    renderTabs('/credential_types');

    expect(
      screen.getByRole('tab', { name: 'Credential types' })
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Credentials' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  test('should hold the first tab open on a page under it', () => {
    renderTabs('/credentials/3/details');

    expect(screen.getByRole('tab', { name: 'Credentials' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('should go to the route of the tab that is picked', async () => {
    const { history, user } = renderTabs('/credentials');

    await user.click(screen.getByRole('tab', { name: 'Credential types' }));

    expect(history.location.pathname).toBe('/credential_types');
  });

  /*
   * A tab covers its own address and what sits under it, segment by segment:
   * /instance_groups begins with the letters of /instance and is not a page
   * of it.
   */
  test('should not open a tab for an address that only shares its letters', () => {
    const history = createMemoryHistory({
      initialEntries: ['/instance_groups'],
    });
    renderWithContexts(
      <ResourceTabs
        aria-label="Instance tabs"
        ouiaId="instance-tabs"
        tabs={[
          { label: 'Topology', path: '/topology' },
          { label: 'Instance', path: '/instance' },
        ]}
      />,
      { context: { router: { history } } }
    );

    expect(screen.getByRole('tab', { name: 'Instance' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    expect(screen.getByRole('tab', { name: 'Topology' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('should draw nothing for no tabs', () => {
    const history = createMemoryHistory({ initialEntries: ['/credentials'] });
    renderWithContexts(
      <ResourceTabs aria-label="No tabs" ouiaId="no-tabs" tabs={[]} />,
      { context: { router: { history } } }
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  describe('isUnder', () => {
    test('takes the address itself and what sits under it', () => {
      expect(isUnder('/credentials', '/credentials')).toBe(true);
      expect(isUnder('/credentials/3/details', '/credentials')).toBe(true);
      expect(isUnder('/credentials/3', '/credentials/')).toBe(true);
    });

    test('refuses an address that only begins with the same letters', () => {
      expect(isUnder('/credential_types', '/credential')).toBe(false);
      expect(isUnder('/credentialsx', '/credentials')).toBe(false);
    });
  });
});
