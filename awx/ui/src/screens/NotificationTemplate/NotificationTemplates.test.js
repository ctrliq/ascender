import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import NotificationTemplates from './NotificationTemplates';


// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./NotificationTemplateList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'NotificationTemplateList'),
  };
});
jest.mock('./NotificationTemplateAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'NotificationTemplateAdd'),
  };
});
jest.mock('./NotificationTemplate', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'NotificationTemplate detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/notification_templates/*"
        element={<NotificationTemplates />}
      />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<NotificationTemplates />', () => {
  test('renders the list at /notification_templates', async () => {
    renderAt('/notification_templates');
    expect(
      await screen.findByText('NotificationTemplateList')
    ).toBeInTheDocument();
  });

  test('renders the add form at /notification_templates/add', async () => {
    renderAt('/notification_templates/add');
    expect(
      await screen.findByText('NotificationTemplateAdd')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('NotificationTemplateList')
    ).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /notification_templates/:id', async () => {
    renderAt('/notification_templates/42/details');
    expect(
      await screen.findByText('NotificationTemplate detail')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('NotificationTemplateList')
    ).not.toBeInTheDocument();
  });
});
