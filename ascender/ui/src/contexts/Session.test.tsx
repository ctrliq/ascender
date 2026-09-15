import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { RootAPI } from 'api';
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
});
