/*
 * React Testing Library counterpart of testUtils/enzymeHelpers.
 *
 * renderWithContexts(ui, { context }) renders a component inside the app's
 * top-level providers (i18n, session, config, router) with the same context
 * defaults and the same override mechanism as mountWithContexts, so enzyme
 * suites can be converted incrementally:
 *
 *   const { history, user } = renderWithContexts(<MyComponent />, {
 *     context: { router: { history: createMemoryHistory(...) } },
 *   });
 *   await user.click(screen.getByRole('button', { name: 'Save' }));
 */
import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import english from '../src/locales/en/messages';
import { SessionProvider } from '../src/contexts/Session';
import { ConfigProvider } from '../src/contexts/Config';

i18n.load({ en: english.messages });
i18n.activate('en');

const defaultContexts = {
  config: {
    ansible_version: null,
    version: null,
    me: { is_superuser: true },
    toJSON: () => '/config/',
    license_info: {
      valid_key: true,
    },
  },
  router: {},
  session: {
    isSessionExpired: false,
    logout: () => {},
    setAuthRedirectTo: () => {},
  },
};

function applyDefaultContexts(context) {
  if (!context) {
    return defaultContexts;
  }
  const newContext = {};
  Object.keys(defaultContexts).forEach((key) => {
    newContext[key] = {
      ...defaultContexts[key],
      ...context[key],
    };
  });
  return newContext;
}

// eslint-disable-next-line import/prefer-default-export
export function renderWithContexts(ui, options = {}) {
  const { context: userContext, ...renderOptions } = options;
  const { config, router, session } = applyDefaultContexts(userContext);
  const history = router.history || createMemoryHistory();

  function Wrapper({ children }) {
    return (
      <I18nProvider i18n={i18n}>
        <SessionProvider value={session}>
          <ConfigProvider value={config}>
            <Router history={history}>{children}</Router>
          </ConfigProvider>
        </SessionProvider>
      </I18nProvider>
    );
  }

  return {
    history,
    user: userEvent.setup(),
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}
