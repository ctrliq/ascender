import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import DeleteRoleConfirmationModal from './DeleteRoleConfirmationModal';

const role = {
  id: 3,
  name: 'Member',
  resource_name: 'Org',
  resource_type: 'organization',
  team_id: 5,
  team_name: 'The Team',
};

describe('<DeleteRoleConfirmationModal />', () => {
  test('should render Team confirmation modal', () => {
    renderWithContexts(
      <DeleteRoleConfirmationModal
        role={role}
        username="jane"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    // The modal title (rendered as the dialog's <Title>) reflects the team variant.
    expect(
      screen.getByRole('dialog', { name: /Remove Team Access/ })
    ).toBeInTheDocument();
    // Body text spans two paragraphs joined by <br/>; assert the dialog body content.
    const body = document.querySelector('.pf-v6-c-modal-box__body');
    expect(body).toHaveTextContent(
      'Are you sure you want to remove Member access from The Team? Doing so affects all members of the team.'
    );
    expect(body).toHaveTextContent(
      'If you only want to remove access for this particular user, please remove them from the team.'
    );
  });

  test('should render the User confirmation delete modal', () => {
    // use a per-test copy without team_id so the shared role fixture (and test
    // order) is not affected
    const userRole = { ...role };
    delete userRole.team_id;
    renderWithContexts(
      <DeleteRoleConfirmationModal
        role={userRole}
        username="jane"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(
      screen.getByRole('dialog', { name: /Remove User Access/ })
    ).toBeInTheDocument();
    const body = document.querySelector('.pf-v6-c-modal-box__body');
    expect(body).toHaveTextContent(
      'Are you sure you want to remove Member access from jane?'
    );
  });
});
