import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import CredentialTypeListItem from './CredentialTypeListItem';

describe('<CredentialTypeListItem/>', () => {
  const credential_type = {
    id: 1,
    name: 'Foo',
    summary_fields: { user_capabilities: { edit: true, delete: true } },
    kind: 'cloud',
  };

  const renderItem = (props = {}) =>
    renderWithContexts(
      <table>
        <tbody>
          <CredentialTypeListItem
            credentialType={credential_type}
            detailUrl="credential_types/1/details"
            isSelected={false}
            onSelect={() => {}}
            rowIndex={0}
            {...props}
          />
        </tbody>
      </table>
    );

  test('should mount successfully', () => {
    renderItem();
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('should render the proper data', () => {
    renderItem();
    expect(screen.getByText('Foo')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit credential type')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select row 0' })
    ).not.toBeChecked();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem({ isSelected: true });
    expect(screen.getByLabelText('Edit credential type')).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem({
      credentialType: {
        ...credential_type,
        summary_fields: { user_capabilities: { edit: false } },
      },
      isSelected: true,
    });
    expect(
      screen.queryByLabelText('Edit credential type')
    ).not.toBeInTheDocument();
  });
});
