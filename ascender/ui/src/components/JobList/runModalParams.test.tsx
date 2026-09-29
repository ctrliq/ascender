import React from 'react';
import { act, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import useForgetRunModalParams, {
  RUN_MODAL_NAMESPACES,
} from './runModalParams';

function Forget() {
  const forget = useForgetRunModalParams();
  return (
    <button type="button" onClick={forget}>
      Forget
    </button>
  );
}

describe('useForgetRunModalParams', () => {
  /*
   * The inventories list pages as inventory and the credentials list as
   * credential. A run's modal opened over either forgets its own lists as it
   * closes, and the search typed into the list behind has to survive that.
   */
  test('should leave the lists behind the modal alone', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/inventories?inventory.name__icontains=web&credential.page=3' +
          '&launch-inventory.page=2&launch-credential.page=2' +
          '&adhoc-credential.page=4&run-template.name__icontains=x',
      ],
    });
    const { user } = renderWithContexts(<Forget />, {
      context: { router: { history } },
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Forget' }));
    });

    expect(history.location.pathname).toEqual('/inventories');
    expect(new URLSearchParams(history.location.search).toString()).toEqual(
      'inventory.name__icontains=web&credential.page=3'
    );
  });

  test('should name no namespace a screen list uses', () => {
    [
      'inventory',
      'credential',
      'credentials',
      'execution_environments',
    ].forEach((screenList) =>
      expect(RUN_MODAL_NAMESPACES).not.toContain(screenList)
    );
  });
});
