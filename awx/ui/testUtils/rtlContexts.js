/*
 * React Testing Library test harness for mounting components with app context.
 *
 * renderWithContexts(ui, { context }) renders a component inside the app's
 * top-level providers (i18n, session, config, router) with sensible context
 * defaults and a per-test override mechanism:
 *
 *   const { history, user } = renderWithContexts(<MyComponent />, {
 *     context: { router: { history: createMemoryHistory(...) } },
 *   });
 *   await user.click(screen.getByRole('button', { name: 'Save' }));
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'react-router';
import { createMemoryHistory } from './historyShim';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import english from '../src/locales/en/messages';
import { SessionProvider } from '../src/contexts/Session';
import { ConfigProvider } from '../src/contexts/Config';

// Match mountWithContexts' i18n defaults. Lingui v6 derives plural rules
// from Intl.PluralRules, so no loadLocaleData step is needed.
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

// react-router v6's low-level <Router> is controlled: it takes the current
// location/navigationType plus the history object as its navigator. Subscribe
// to the (history v5) history so location changes re-render — the v6 equivalent
// of react-router-dom's unstable_HistoryRouter, inlined to avoid the unstable
// API and any history-version coupling.
function HistoryRouter({ history, children }) {
  const [state, setState] = React.useState({
    action: history.action,
    location: history.location,
  });
  React.useLayoutEffect(() => history.listen(setState), [history]);
  return (
    <Router
      location={state.location}
      navigationType={state.action}
      navigator={history}
    >
      {children}
    </Router>
  );
}

export function renderWithContexts(ui, options = {}) {
  const { context: userContext, ...renderOptions } = options;
  const { config, router, session } = applyDefaultContexts(userContext);
  const history = router.history || createMemoryHistory();

  function Wrapper({ children }) {
    return (
      <I18nProvider i18n={i18n}>
        <SessionProvider value={session}>
          <ConfigProvider value={config}>
            <HistoryRouter history={history}>{children}</HistoryRouter>
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

/*
 * Settle PF4 tooltips before a test ends.
 *
 * Closing a PF Modal restores focus (on a timeout) to the element that opened
 * it; when that element is wrapped in a PF Tooltip, the tooltip engages after
 * its 300ms entry delay. A tooltip pending or visible when the test unmounts
 * leaves async Popper work that logs "state update on unmounted component"
 * into the NEXT test, which the setupTests console-error trap turns into an
 * order-dependent failure. Call this as the last step of any test that ends
 * shortly after closing a modal.
 */
export async function settleTooltips() {
  await act(async () => {
    // PF5 Tooltip fires a state update ~300ms after focus returns to a
    // tooltip-wrapped element.  Modal close restores focus via setTimeout(0),
    // so the full chain is: 0ms (focus restore) + 300ms (tooltip entry delay).
    // Waiting 500ms inside act() lets both fire inside the act boundary.
    await new Promise((r) => { setTimeout(r, 500); });
    document.activeElement?.blur();
    await new Promise((r) => { setTimeout(r, 100); });
  });
}

/*
 * Assert a <Detail label={...} value={...} /> rendered the expected pair.
 * Detail renders <div><dt>label</dt><dd>value</dd></div> (components/DetailList).
 */
export function assertDetail(label, value) {
  const term = screen.getByText(label);
  expect(term.nextElementSibling).toHaveTextContent(value);
}
