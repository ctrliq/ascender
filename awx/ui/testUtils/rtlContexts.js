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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router, useLocation } from 'react-router-dom';
import { Router as RouterV6 } from 'react-router-dom-v5-compat';
import { createMemoryHistory } from 'history';
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

// The v5 Router subscribes to history and drives re-renders; this nested v6
// Router is fully controlled (location comes from v5's context, the navigator
// is the shared history object) so components migrated to the
// react-router-dom-v5-compat APIs work without a second subscription.
function CompatV6Layer({ history, children }) {
  const location = useLocation();
  return (
    <RouterV6 location={location} navigator={history}>
      {children}
    </RouterV6>
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
            <Router history={history}>
              <CompatV6Layer history={history}>{children}</CompatV6Layer>
            </Router>
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
  // the focus restore is setTimeout(0) and the tooltip entry delay is 300ms,
  // so 700ms comfortably covers "tooltip will appear"; when none is coming
  // this caps the dead wait well below findByRole's 1s default
  const tooltip = await screen
    .findByRole('tooltip', {}, { timeout: 700 })
    .catch(() => null);
  if (!tooltip) {
    return;
  }
  document.activeElement.blur();
  await waitFor(
    () => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
    { timeout: 2000 }
  );
}

/*
 * Assert a <Detail label={...} value={...} /> rendered the expected pair.
 * Detail renders <div><dt>label</dt><dd>value</dd></div> (components/DetailList).
 */
export function assertDetail(label, value) {
  const term = screen.getByText(label);
  expect(term.nextElementSibling).toHaveTextContent(value);
}
