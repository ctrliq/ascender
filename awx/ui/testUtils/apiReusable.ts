import type { Mock } from 'vitest';
import type { Http } from '../src/api/Base';

/**
 * What the shared cases below exercise, which is all any model has to offer
 * to be handed to describeNotificationMixin: the two dispatching methods the
 * mixin adds, and the base url they build their paths from.
 */
interface NotificationMixinModel {
  baseUrl: string;
  associateNotificationTemplate(
    resourceId: number | string,
    notificationId: number | string,
    notificationType: string
  ): unknown;
  disassociateNotificationTemplate(
    resourceId: number | string,
    notificationId: number | string,
    notificationType: string
  ): unknown;
}

/**
 * Runs the notification mixin's own cases against one model, so each model
 * that mixes it in gets them without repeating them.
 *
 * Args:
 *   Model: The model class to instantiate, with a stub http in place of the
 *     real one so the posts it makes can be read back.
 *   name: What to name the describe block this opens.
 */
export function describeNotificationMixin(
  Model: new (http: Http) => NotificationMixinModel,
  name: string
) {
  describe(name, () => {
    let mockHttp: { post: Mock };
    let ModelAPI: NotificationMixinModel;
    beforeEach(() => {
      mockHttp = { post: vi.fn(() => Promise.resolve()) };
      ModelAPI = new Model(mockHttp as unknown as Http);
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
