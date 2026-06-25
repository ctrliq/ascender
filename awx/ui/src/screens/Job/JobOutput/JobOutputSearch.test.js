import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import JobOutputSearch from './JobOutputSearch';

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  history: () => ({
    location: '/jobs/playbook/1/output',
  }),
}));

const qsConfig = {
  defaultParams: { page: 1 },
  integerFields: ['page', 'page_size'],
};

// The column dropdown is the Search "Simple key select" (ouiaId). The single
// Select keeps the currently-selected column in its toggle text and lists only
// the remaining columns as options, so the full set is the selected toggle
// value followed by the option labels.
async function getColumnNames(user) {
  const select = document.querySelector(
    '[data-ouia-component-id="simple-key-select"]'
  );
  const toggle = select.querySelector('button');
  const selected = select.querySelector('.pf-v5-c-select__toggle-text')
    .textContent;
  await user.click(toggle);
  const listbox = await screen.findByRole('listbox');
  const options = within(listbox)
    .getAllByRole('option')
    .map((o) => o.textContent);
  await user.click(toggle);
  return [selected, ...options];
}

describe('JobOutputSearch', () => {
  test('should update url query params', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs/playbook/1/output'],
    });

    const { user } = renderWithContexts(
      <JobOutputSearch
        job={{
          status: 'successful',
          type: 'project',
        }}
        qsConfig={qsConfig}
      />,
      {
        context: { router: { history } },
      }
    );

    const input = screen.getByLabelText('Search text input');
    await user.type(input, '99');
    await user.click(
      screen.getByRole('button', { name: 'Search submit button' })
    );

    const names = await getColumnNames(user);
    expect(names).toEqual(['Stdout', 'Event', 'Advanced']);

    await waitFor(() =>
      expect(history.location.search).toEqual('?stdout__icontains=99')
    );
  });

  test('Should not have Event key in search drop down for system job', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs/playbook/1/output'],
    });

    const { user } = renderWithContexts(
      <JobOutputSearch
        job={{
          status: 'successful',
          type: 'system_job',
        }}
        qsConfig={qsConfig}
      />,
      {
        context: { router: { history } },
      }
    );

    expect(await getColumnNames(user)).toEqual(['Stdout', 'Advanced']);
  });

  test('Should not have Event key in search drop down for inventory update job', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs/playbook/1/output'],
    });

    const { user } = renderWithContexts(
      <JobOutputSearch
        job={{
          status: 'successful',
          type: 'inventory_update',
        }}
        qsConfig={qsConfig}
      />,
      {
        context: { router: { history } },
      }
    );

    expect(await getColumnNames(user)).toEqual(['Stdout', 'Advanced']);
  });
});
