/*
 * Enzyme helpers for injecting top-level contexts
 * derived from https://lingui.js.org/guides/testing.html
 */
import React from 'react';
import { shape, string } from 'prop-types';
import { mount, shallow } from 'enzyme';
import { Router, useLocation } from 'react-router-dom';
import { Router as RouterV6 } from 'react-router-dom-v5-compat';
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
  router: {
    history_: {
      push: () => {},
      replace: () => {},
      createHref: () => {},
      listen: () => {},
      location: {
        hash: '',
        pathname: '',
        search: '',
        state: '',
      },
      toJSON: () => '/history/',
    },
    route: {
      location: {
        hash: '',
        pathname: '',
        search: '',
        state: '',
      },
      match: {
        params: {},
        isExact: false,
        path: '',
        url: '',
      },
    },
    toJSON: () => '/router/',
  },
  session: {
    isSessionExpired: false,
    logout: () => {},
    setAuthRedirectTo: () => {},
  },
};

// The v5 Router above subscribes to history and drives re-renders; this
// nested v6 Router is fully controlled (location comes from v5's context,
// the navigator is the shared history object) so components migrated to
// the react-router-dom-v5-compat APIs work without a second subscription.
function CompatV6Layer({ history, children }) {
  const location = useLocation();
  return (
    <RouterV6 location={location} navigator={history}>
      {children}
    </RouterV6>
  );
}

function wrapContexts(node, context) {
  const { config, router, session } = context;
  const history = router.history || createMemoryHistory();
  class Wrap extends React.Component {
    render() {

      const { children, ...props } = this.props;
      const component = React.cloneElement(children, props);
      return (
        <I18nProvider i18n={i18n}>
          <SessionProvider value={session}>
            <ConfigProvider value={config}>
              <Router history={history}>
                <CompatV6Layer history={history}>{component}</CompatV6Layer>
              </Router>
            </ConfigProvider>
          </SessionProvider>
        </I18nProvider>
      );
    }
  }

  return <Wrap>{node}</Wrap>;
}

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

export function shallowWithContexts(node, options = {}) {
  const context = applyDefaultContexts(options.context);
  return shallow(wrapContexts(node, context));
}

export function mountWithContexts(node, options = {}) {
  const context = applyDefaultContexts(options.context);
  const childContextTypes = {
    config: shape({
      ansible_version: string,
      version: string,
    }),
    router: shape({
      route: shape({
        location: shape({}),
        match: shape({}),
      }).isRequired,
      history: shape({}),
    }),
    session: shape({}),
    ...options.childContextTypes,
  };
  return mount(wrapContexts(node, context), { context, childContextTypes });
}

/**
 * Wait for element(s) to achieve a desired state.
 *
 * @param[wrapper] - A ReactWrapper instance
 * @param[selector] - The selector of the element(s) to wait for.
 * @param[callback] - Callback to poll - by default this checks for a node count of 1.
 */
export function waitForElement(
  wrapper,
  selector,
  callback = (el) => el.length === 1
) {
  const interval = 100;
  return new Promise((resolve, reject) => {
    let attempts = 30;
    (function pollElement() {
      wrapper.update();
      const el = wrapper.find(selector);
      if (callback(el)) {
        return resolve(el);
      }
      if (--attempts <= 0) {
        const message = `Expected condition for <${selector}> not met: ${callback.toString()}`;
        return reject(new Error(message));
      }
      return setTimeout(pollElement, interval);
    })();
  });
}
