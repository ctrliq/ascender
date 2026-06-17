import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { SettingsAPI, RootAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../testUtils/enzymeHelpers';
import mockAllOptions from './shared/data.allSettingOptions.json';
import Settings from './Settings';

jest.mock('../../api');

describe('<Settings />', () => {
  let wrapper;

  beforeEach(() => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
    SettingsAPI.readAllOptions.mockResolvedValue({
      data: mockAllOptions,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should redirect users without system admin or auditor permissions', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings'],
    });
    await act(async () => {
      wrapper = mountWithContexts(
        <Routes>
          <Route path="/settings/*" element={<Settings />} />
          <Route path="*" element={null} />
        </Routes>,
        {
          context: {
            router: {
              history,
            },
            config: {
              me: {
                is_superuser: false,
                is_system_auditor: false,
              },
            },
          },
        }
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(history.location.pathname).toBe('/');
    expect(wrapper.find('SettingList').length).toBe(0);
  });

  test('should render Settings for users with system admin or auditor permissions', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings'],
    });
    await act(async () => {
      wrapper = mountWithContexts(
        <Routes>
          <Route path="/settings/*" element={<Settings />} />
        </Routes>,
        {
          context: {
            router: {
              history,
            },
            config: {
              is_superuser: true,
              is_system_auditor: true,
            },
          },
        }
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(wrapper.find('SettingList').length).toBe(1);
  });

  test('should render content error on throw', async () => {
    SettingsAPI.readAllOptions.mockRejectedValue(new Error());
    const history = createMemoryHistory({
      initialEntries: ['/settings'],
    });
    await act(async () => {
      wrapper = mountWithContexts(
        <Routes>
          <Route path="/settings/*" element={<Settings />} />
          <Route path="*" element={null} />
        </Routes>,
        {
          context: {
            router: {
              history,
            },
          },
        }
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(wrapper.find('ContentError').length).toBe(1);
  });
});
