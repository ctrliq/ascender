import React from 'react';
import { act, screen } from '@testing-library/react';

import { InventoryUpdatesAPI, ProjectUpdatesAPI } from 'api';
import { renderWithContexts } from '../../testUtils/rtlContexts';
import type { ResponseOf } from '../../testUtils/responseOf';
import useCanCancelSync from './useCanCancelSync';

vi.mock('../api');

interface ProbeProps {
  type: 'project_update' | 'inventory_update';
  jobId?: number;
  status?: string;
  isAdmin?: boolean;
}

function Probe({ type, jobId, status, isAdmin }: ProbeProps) {
  const canCancel = useCanCancelSync(type, jobId, status, isAdmin);
  return <div data-testid="answer">{canCancel ? 'yes' : 'no'}</div>;
}

const notSuperuser = { config: { me: { id: 2, is_superuser: false } } };

function mockCancel(model: typeof ProjectUpdatesAPI, cancel: boolean) {
  vi.mocked(model.readDetail).mockResolvedValue({
    data: { summary_fields: { user_capabilities: { cancel } } },
  } as unknown as ResponseOf<typeof model.readDetail>);
}

describe('useCanCancelSync', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  test('a finished sync is never offered for cancel', () => {
    renderWithContexts(
      <Probe type="project_update" jobId={4} status="successful" isAdmin />
    );
    expect(screen.getByTestId('answer')).toHaveTextContent('no');
    expect(ProjectUpdatesAPI.readDetail).not.toHaveBeenCalled();
  });

  test('a new sync may be canceled as well as a running one', () => {
    renderWithContexts(
      <Probe type="project_update" jobId={4} status="new" isAdmin />
    );
    expect(screen.getByTestId('answer')).toHaveTextContent('yes');
  });

  test('an admin of the object is answered without a request', () => {
    renderWithContexts(
      <Probe type="project_update" jobId={4} status="running" isAdmin />,
      { context: notSuperuser }
    );
    expect(screen.getByTestId('answer')).toHaveTextContent('yes');
    expect(ProjectUpdatesAPI.readDetail).not.toHaveBeenCalled();
  });

  test('a superuser is answered without a request', () => {
    renderWithContexts(
      <Probe type="inventory_update" jobId={4} status="pending" />
    );
    expect(screen.getByTestId('answer')).toHaveTextContent('yes');
    expect(InventoryUpdatesAPI.readDetail).not.toHaveBeenCalled();
  });

  test('anyone else gets the running update’s own cancel capability', async () => {
    mockCancel(
      InventoryUpdatesAPI as unknown as typeof ProjectUpdatesAPI,
      true
    );
    renderWithContexts(
      <Probe type="inventory_update" jobId={9} status="running" />,
      { context: notSuperuser }
    );
    expect(await screen.findByText('yes')).toBeInTheDocument();
    expect(InventoryUpdatesAPI.readDetail).toHaveBeenCalledWith(9);
    expect(ProjectUpdatesAPI.readDetail).not.toHaveBeenCalled();
  });

  test('a user the api would refuse is not offered cancel', async () => {
    mockCancel(ProjectUpdatesAPI, false);
    renderWithContexts(
      <Probe type="project_update" jobId={9} status="waiting" />,
      { context: notSuperuser }
    );
    // Let the read settle, so the answer checked is the one given after it.
    await act(async () => {});
    expect(ProjectUpdatesAPI.readDetail).toHaveBeenCalledWith(9);
    expect(screen.getByTestId('answer')).toHaveTextContent('no');
  });
});
