import type { Untyped } from 'types/api';
// eslint-disable-next-line import-x/prefer-default-export
export function describeNotificationMixin(Model: Untyped, name: Untyped) {
  describe(name, () => {
    let mockHttp: Untyped;
    let ModelAPI: Untyped;
    beforeEach(() => {
      mockHttp = { post: vi.fn(() => Promise.resolve()) };
      ModelAPI = new Model(mockHttp);
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    const parameters = ['success', 'error'];

    parameters.forEach((type) => {
      const label = `[notificationType=${type}, associationState=true`;
      const testName = `associateNotificationTemplate ${label} makes expected http calls`;

      test(testName, async () => {
        await ModelAPI.associateNotificationTemplate(1, 21, type);

        const expectedPath = `${ModelAPI.baseUrl}1/notification_templates_${type}/`;
        expect(mockHttp.post).toHaveBeenCalledTimes(1);

        const expectedParams = { id: 21 };
        expect(mockHttp.post.mock.calls.pop()).toEqual([
          expectedPath,
          expectedParams,
        ]);
      });
    });

    parameters.forEach((type) => {
      const label = `[notificationType=${type}, associationState=false`;
      const testName = `disassociateNotificationTemplate ${label} makes expected http calls`;

      test(testName, async () => {
        await ModelAPI.disassociateNotificationTemplate(1, 21, type);

        const expectedPath = `${ModelAPI.baseUrl}1/notification_templates_${type}/`;
        expect(mockHttp.post).toHaveBeenCalledTimes(1);

        const expectedParams = { id: 21, disassociate: true };
        expect(mockHttp.post.mock.calls.pop()).toEqual([
          expectedPath,
          expectedParams,
        ]);
      });
    });
  });
}
