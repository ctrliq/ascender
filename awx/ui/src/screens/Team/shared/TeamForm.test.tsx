import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { OrganizationsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import TeamForm from './TeamForm';

vi.mock('../../../api');

const meConfig = { me: { is_superuser: false } };
const mockData = {
  id: 1,
  name: 'Foo',
  description: 'Bar',
  organization: 1,
  summary_fields: { organization: { id: 1, name: 'Default' } },
};

describe('<TeamForm />', () => {
  beforeEach(() => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    vi.mocked(OrganizationsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} } },
    } as unknown as ResponseOf<typeof OrganizationsAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderForm = (props = {}) =>
    renderWithContexts(
      <TeamForm
        team={mockData}
        handleSubmit={vi.fn()}
        handleCancel={vi.fn()}
        me={meConfig.me}
        {...props}
      />
    );

  test('changing inputs should update form values', async () => {
    const { user, container } = renderForm();
    const nameInput = container.querySelector('#team-name');
    const descriptionInput = container.querySelector('#team-description');

    await user.clear(nameInput!);
    await user.type(nameInput!, 'new foo');
    await user.clear(descriptionInput!);
    await user.type(descriptionInput!, 'new bar');

    expect(nameInput).toHaveValue('new foo');
    expect(descriptionInput).toHaveValue('new bar');
  });

  test('should call handleSubmit when Submit button is clicked', async () => {
    const handleSubmit = vi.fn();
    const { user } = renderForm({ handleSubmit });
    expect(handleSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalled());
  });

  test('calls handleCancel when Cancel button is clicked', async () => {
    const handleCancel = vi.fn();
    const { user } = renderForm({ handleCancel });
    expect(handleCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleCancel).toHaveBeenCalled();
  });
});
