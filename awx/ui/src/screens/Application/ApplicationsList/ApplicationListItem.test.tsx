import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ApplicationListItem from './ApplicationListItem';

describe('<ApplicationListItem/>', () => {
  const application = {
    id: 1,
    name: 'Foo',
    summary_fields: {
      organization: { id: 2, name: 'Organization' },
      user_capabilities: { edit: true },
    },
  };

  function renderItem(app = application) {
    return renderWithContexts(
      <table>
        <tbody>
          <ApplicationListItem
            application={app}
            detailUrl="/organizations/2/details"
            isSelected={false}
            onSelect={() => {}}
          />
        </tbody>
      </table>
    );
  }

  test('should mount successfully', () => {
    renderItem();
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('should render the proper data', () => {
    renderItem();
    const row = screen.getByRole('row');
    const nameCell = within(row)
      .getAllByRole('cell')
      .find((cell) => cell.getAttribute('data-label') === 'Name');
    const orgCell = within(row)
      .getAllByRole('cell')
      .find((cell) => cell.getAttribute('data-label') === 'Organization');
    expect(nameCell).toHaveTextContent('Foo');
    expect(orgCell).toHaveTextContent('Organization');
    expect(
      screen.getByRole('link', { name: 'Edit application' })
    ).toBeInTheDocument();
  });
});
