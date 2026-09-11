import type { Untyped } from 'types/api';
import Teams from './Teams';

describe('TeamsAPI', () => {
  const teamId = 1;
  const roleId = 7;

  let TeamsAPI: Untyped;
  let mockHttp: Untyped;

  beforeEach(() => {
    const createPromise = () => Promise.resolve();
    mockHttp = { post: vi.fn(createPromise) };

    TeamsAPI = new Teams(mockHttp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('associate role calls post with expected params', async () => {
    await TeamsAPI.associateRole(teamId, roleId);

    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post.mock.calls[0]).toEqual([
      `api/v2/teams/${teamId}/roles/`,
      { id: roleId },
    ]);
  });

  test('read teams calls post with expected params', async () => {
    await TeamsAPI.disassociateRole(teamId, roleId);

    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post.mock.calls[0]).toEqual([
      `api/v2/teams/${teamId}/roles/`,
      {
        id: roleId,
        disassociate: true,
      },
    ]);
  });
});
