import React from 'react';
import { act } from 'react-dom/test-utils';
import { RootAPI } from 'api';
import * as SessionContext from 'contexts/Session';
import { shallow } from 'enzyme';
import { mountWithContexts } from '../testUtils/enzymeHelpers';
import * as navigation from 'util/navigation';
import App, { ProtectedRoute } from './App';

jest.mock('./api');
jest.mock('util/webWorker', () => jest.fn());

describe('<App />', () => {
  beforeEach(() => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
  });

  test('renders ok', async () => {
    const contextValues = {
      setAuthRedirectTo: jest.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      loginRedirectOverride: null,
    };
    jest
      .spyOn(SessionContext, 'useSession')
      .mockImplementation(() => contextValues);

    let wrapper;
    await act(async () => {
      wrapper = shallow(<App />);
    });
    expect(wrapper.length).toBe(1);
    jest.clearAllMocks();
  });

  test('redirect to login override', async () => {
    const replaceSpy = jest
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});

    expect(replaceSpy).not.toHaveBeenCalled();

    const contextValues = {
      setAuthRedirectTo: jest.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      loginRedirectOverride: '/sso/test',
    };
    jest
      .spyOn(SessionContext, 'useSession')
      .mockImplementation(() => contextValues);

    await act(async () => {
      mountWithContexts(
        <ProtectedRoute>
          <div>foo</div>
        </ProtectedRoute>
      );
    });

    expect(replaceSpy).toHaveBeenCalled();
    replaceSpy.mockRestore();
  });
});
