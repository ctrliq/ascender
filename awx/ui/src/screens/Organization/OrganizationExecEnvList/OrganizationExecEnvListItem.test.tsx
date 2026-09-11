import React from 'react';
import { screen } from '@testing-library/react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import OrganizationExecEnvListItem from './OrganizationExecEnvListItem';

describe('<OrganizationExecEnvListItem/>', () => {
  const executionEnvironment = {
    id: 1,
    image: 'https://registry.com/r/image/manifest',
    name: 'foo',
    organization: 1,
    credential: null,
    pull: 'always',
  };

  function renderItem() {
    return renderWithContexts(
      <table>
        <tbody>
          <OrganizationExecEnvListItem
            executionEnvironment={executionEnvironment}
            detailUrl="execution_environments/1/details"
          />
        </tbody>
      </table>
    );
  }

  test('should mount successfully', () => {
    renderItem();
    expect(screen.getByRole('row')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'foo' })).toBeInTheDocument();
  });

  test('should render the proper data', () => {
    renderItem();
    const imageCell = screen
      .getAllByRole('cell')
      .find((cell) => cell.getAttribute('data-label') === 'Image');
    expect(imageCell).toHaveTextContent(executionEnvironment.image);
  });
});
