import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { OrganizationsAPI, ProjectsAPI, RootAPI } from 'api';
import mockOrganization from 'util/data.organization.json';
import {
  mountWithContexts,
  waitForElement,
} from '../../../testUtils/enzymeHelpers';
import mockDetails from './data.project.json';
import Project from './Project';

jest.mock('../../api');

const mockMe = {
  is_super_user: true,
  is_system_auditor: false,
};

async function getOrganizations() {
  return {
    count: 1,
    next: null,
    previous: null,
    data: {
      results: [mockOrganization],
    },
  };
}

// Mount under the same /projects/:id/* route that Projects.js gives it, so the
// nested v6 <Routes> resolve and useParams sees the id.
function renderProject(initialEntry = '/projects/1/details') {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return mountWithContexts(
    <Routes>
      <Route
        path="/projects/:id/*"
        element={<Project setBreadcrumb={() => {}} me={mockMe} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Project />', () => {
  let wrapper;

  beforeEach(() => {
    OrganizationsAPI.read = jest.fn();
    ProjectsAPI.readDetail = jest.fn();
    ProjectsAPI.readDetail.mockResolvedValue({ data: mockDetails });
    OrganizationsAPI.read.mockImplementation(getOrganizations);
    // the resolved detail route mounts components that read the brand name
    RootAPI.readAssetVariables = jest
      .fn()
      .mockResolvedValue({ data: { BRAND_NAME: 'AWX' } });
  });

  test('initially renders successfully', async () => {
    await act(async () => {
      renderProject();
    });
  });

  test('notifications tab shown for admins', async () => {
    await act(async () => {
      wrapper = renderProject();
    });
    const tabs = await waitForElement(
      wrapper,
      '.pf-c-tabs__item-text',
      (el) => el.length === 6
    );
    expect(tabs.at(4).text()).toEqual('Notifications');
  });

  test('notifications tab hidden with reduced permissions', async () => {
    OrganizationsAPI.read = async () => ({
      count: 0,
      next: null,
      previous: null,
      data: { results: [] },
    });
    await act(async () => {
      wrapper = renderProject();
    });
    const tabs = await waitForElement(
      wrapper,
      '.pf-c-tabs__item-text',
      (el) => el.length === 5
    );
    tabs.forEach((tab) => expect(tab.text()).not.toEqual('Notifications'));
  });

  test('schedules tab shown for scm based projects.', async () => {
    OrganizationsAPI.read = async () => ({
      count: 0,
      next: null,
      previous: null,
      data: { results: [] },
    });

    await act(async () => {
      wrapper = renderProject();
    });
    const tabs = await waitForElement(
      wrapper,
      '.pf-c-tabs__item',
      (el) => el.length === 5
    );
    expect(tabs.at(4).text()).toEqual('Schedules');
  });

  test('schedules tab hidden for manual projects.', async () => {
    const manualDetails = Object.assign(mockDetails, { scm_type: '' });
    ProjectsAPI.readDetail = async () => ({ data: manualDetails });
    OrganizationsAPI.read = async () => ({
      count: 0,
      next: null,
      previous: null,
      data: { results: [] },
    });

    await act(async () => {
      wrapper = renderProject();
    });
    const tabs = await waitForElement(
      wrapper,
      '.pf-c-tabs__item',
      (el) => el.length === 4
    );
    tabs.forEach((tab) => expect(tab.text()).not.toEqual('Schedules'));
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    await act(async () => {
      wrapper = renderProject('/projects/1/foobar');
    });
    await waitForElement(wrapper, 'ContentError', (el) => el.length === 1);
  });
});
