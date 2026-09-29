import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { RootAPI } from 'api';
import * as navigation from 'util/navigation';
import { cachedOptions } from '../api/optionsCache';
import queryClient from '../queryClient';

vi.mock('api');

// The shared setup replaces this context with a stub for every other test, so
// the provider under test here is the real one, asked for by name.
const { SessionProvider, useSession } =
  await vi.importActual<typeof import('./Session')>('./Session');

function LogoutButton() {
  const { logout } = useSession();
  return (
    <button type="button" onClick={() => logout()}>
      Logout
    </button>
  );
}

// What the idle timeout does once its countdown runs out, without waiting
// the countdown out.
function ExpireButton() {
  const { logout, isSessionExpired } = useSession();
  return (
    <button
      type="button"
      onClick={() => {
        (isSessionExpired as React.MutableRefObject<boolean>).current = true;
        logout();
      }}
    >
      Expire
    </button>
  );
}

describe('SessionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (RootAPI.logout as ReturnType<typeof vi.fn>).mockResolvedValue({});
    // The provider renders nothing until this read settles.
    (RootAPI.read as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
  });

  // Both caches are module singletons keyed by what was asked for, and logging
  // out navigates rather than reloading, so without this the next user to log
  // in on this tab is answered from the last one's reads. The actions an
  // OPTIONS reply carries are what decide which buttons a screen offers.
  test('should empty the caches on logout, so the next user reads afresh', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn().mockResolvedValue({ actions: { POST: {} } });

    await cachedOptions(['options', '/api/v2/job_templates/'], fetch);
    await cachedOptions(['options', '/api/v2/job_templates/'], fetch);
    expect(fetch).toHaveBeenCalledTimes(1);

    queryClient.setQueryData(['job_templates'], { count: 1 });
    expect(queryClient.getQueryData(['job_templates'])).toBeDefined();

    render(
      <MemoryRouter>
        <SessionProvider>
          <LogoutButton />
        </SessionProvider>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(RootAPI.logout).toHaveBeenCalled());
    expect(queryClient.getQueryData(['job_templates'])).toBeUndefined();

    await cachedOptions(['options', '/api/v2/job_templates/'], fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // An OIDC session can be ended at the provider too, and the server says
  // where to send the browser for that instead of redirecting on its own.
  test('goes on to the provider when the server hands back a logout url', async () => {
    const user = userEvent.setup();
    const replace = vi
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});
    (RootAPI.logout as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { logout_url: 'https://idp.example.com/logout?client_id=x' },
    });

    render(
      <MemoryRouter>
        <SessionProvider>
          <LogoutButton />
        </SessionProvider>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Logout' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        'https://idp.example.com/logout?client_id=x'
      )
    );
    replace.mockRestore();
  });

  // Ending the session at the provider would log the user out of every other
  // application sharing it, which an idle tab has no business doing.
  test('does not go on to the provider when the session expired', async () => {
    const user = userEvent.setup();
    const replace = vi
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});
    (RootAPI.logout as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { logout_url: 'https://idp.example.com/logout?client_id=x' },
    });

    render(
      <MemoryRouter>
        <SessionProvider>
          <ExpireButton />
        </SessionProvider>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Expire' }));
    await waitFor(() => expect(RootAPI.logout).toHaveBeenCalled());

    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  test('does not follow a logout url that is not a web address', async () => {
    const user = userEvent.setup();
    const replace = vi
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});
    (RootAPI.logout as ReturnType<typeof vi.fn>).mockResolvedValue({
      // The literal is the very value under test.
      // eslint-disable-next-line no-script-url
      data: { logout_url: 'javascript:alert(1)' },
    });

    render(
      <MemoryRouter>
        <SessionProvider>
          <LogoutButton />
        </SessionProvider>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Logout' }));
    await waitFor(() => expect(RootAPI.logout).toHaveBeenCalled());

    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  test('stays here when there is no provider to log out of', async () => {
    const user = userEvent.setup();
    const replace = vi
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});

    render(
      <MemoryRouter>
        <SessionProvider>
          <LogoutButton />
        </SessionProvider>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Logout' }));
    await waitFor(() => expect(RootAPI.logout).toHaveBeenCalled());

    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  // The cached theme mirrors the account's and is what the next sign-in
  // paints with before /api/v2/me/ answers, so logging out leaves it alone.
  test('keeps the cached theme on logout', async () => {
    const user = userEvent.setup();
    localStorage.setItem('theme', 'light');

    render(
      <MemoryRouter>
        <SessionProvider>
          <LogoutButton />
        </SessionProvider>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Logout' }));
    await waitFor(() => expect(RootAPI.logout).toHaveBeenCalled());

    expect(localStorage.getItem('theme')).toBe('light');
    localStorage.removeItem('theme');
  });
});
