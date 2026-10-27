import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router';
import { ErrorBoundary } from 'react-error-boundary';
import locationReplace, { isHttpUrl } from 'util/navigation';
import { isSocialLoginUrl, submitSocialLoginForm } from 'util/socialLogin';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { Card, PageSection } from '@patternfly/react-core';
import {
  ConfigProvider,
  useAuthorizedPath,
  useUserProfile,
} from 'contexts/Config';
import { SessionProvider, useSession } from 'contexts/Session';
import AppContainer from 'components/AppContainer';
import ContentError from 'components/ContentError';
import NotFound from 'screens/NotFound';
import Login from 'screens/Login';
import { isAuthenticated } from 'util/auth';
import { getLanguageWithoutRegionCode } from 'util/language';
import Metrics from 'screens/Metrics';
import SubscriptionEdit from 'screens/Setting/Subscription/SubscriptionEdit';
import { dynamicActivate, locales } from './i18nLoader';
import getRouteConfig from './routeConfig';
import { SESSION_REDIRECT_URL } from './constants';

function ErrorFallback({ error }) {
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <ContentError error={error} />
      </Card>
    </PageSection>
  );
}

const RenderAppContainer = () => {
  const userProfile = useUserProfile();
  const navRouteConfig = getRouteConfig(userProfile);

  return (
    <AppContainer navRouteConfig={navRouteConfig}>
      <AuthorizedRoutes routeConfig={navRouteConfig} />
    </AppContainer>
  );
};

const AuthorizedRoutes = ({ routeConfig }) => {
  const isAuthorized = useAuthorizedPath();

  if (!isAuthorized) {
    return (
      <Routes>
        <Route
          path="/subscription_management"
          element={
            <ProtectedRoute>
              <PageSection hasBodyWrapper={false}>
                <Card>
                  <SubscriptionEdit />
                </Card>
              </PageSection>
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={<Navigate to="/subscription_management" replace />}
        />
      </Routes>
    );
  }

  return (
    <Routes>
      {routeConfig
        .flatMap(({ routes }) => routes)
        .map(({ path, screen: Screen }) => (
          // /* so each screen's own nested <Routes> can match the rest
          <Route
            key={path}
            path={`${path}/*`}
            element={
              <ProtectedRoute>
                <Screen />
              </ProtectedRoute>
            }
          />
        ))
        .concat(
          <Route
            key="metrics"
            path="/metrics/*"
            element={
              <ProtectedRoute>
                <Metrics />
              </ProtectedRoute>
            }
          />,
          <Route
            key="not-found"
            path="*"
            element={
              <ProtectedRoute>
                <NotFound />
              </ProtectedRoute>
            }
          />
        )}
    </Routes>
  );
};

export function ProtectedRoute({ children }) {
  const {
    authRedirectTo,
    isUserBeingLoggedOut,
    loginRedirectOverride,
    setAuthRedirectTo,
  } = useSession();
  const location = useLocation();

  useEffect(() => {
    setAuthRedirectTo(
      authRedirectTo === '/logout'
        ? '/'
        : `${location.pathname}${location.search}`
    );
  });

  const authenticated = isAuthenticated(document.cookie);
  // The override is an admin-typed string handed to window.location for
  // every visitor. One with a scheme the browser would run rather than
  // fetch (javascript:, data:) is ignored, and the visitor gets the login
  // page. The server refuses to store such a value and drops one it finds
  // already stored, so this is the browser's own last line.
  const redirectTo =
    !authenticated &&
    loginRedirectOverride &&
    isHttpUrl(loginRedirectOverride) &&
    !window.location.href.includes('/login') &&
    !isUserBeingLoggedOut
      ? loginRedirectOverride
      : null;
  const requestedPath = `${location.pathname}${location.search}`;

  // Leaving the page is a side effect, and one that must happen once:
  // React re-renders this component while the browser is still unloading,
  // and StrictMode mounts it twice in development.
  const hasLeft = useRef(false);
  useEffect(() => {
    if (!redirectTo || hasLeft.current) {
      return;
    }
    hasLeft.current = true;
    if (isSocialLoginUrl(redirectTo)) {
      // The override points at social-auth's login-initiation view, which
      // only accepts POST (see util/socialLogin). Save where the user was
      // heading, as the login page's own provider buttons do, so the app
      // can put them back there when the provider returns them.
      window.sessionStorage.setItem(SESSION_REDIRECT_URL, requestedPath);
      submitSocialLoginForm(redirectTo);
    } else {
      locationReplace(redirectTo);
    }
  }, [redirectTo, requestedPath]);

  if (authenticated) {
    return (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {children}
      </ErrorBoundary>
    );
  }

  if (redirectTo) {
    return null;
  }
  return <Navigate to="/login" replace />;
}

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useLayoutEffect(() => {
    const { getStoredThemeId, applyTheme } = require('./themeRegistry');
    applyTheme(getStoredThemeId());
  }, []);
  const navigate = useNavigate();
  const { search } = useLocation();
  const searchParams = Object.fromEntries(new URLSearchParams(search));
  const pseudolocalization =
    searchParams.pseudolocalization === 'true' || false;
  let language =
    searchParams.lang ||
    localStorage.getItem('preferred_language') ||
    getLanguageWithoutRegionCode(navigator) ||
    'en';

  if (!Object.keys(locales).includes(language)) {
    // If there isn't a string catalog available for the browser's
    // preferred language, default to one that has strings.
    language = 'en';
  }

  useEffect(() => {
    dynamicActivate(language, pseudolocalization).then(() => {
      setIsLoading(false);
    });
  }, [language, pseudolocalization]);

  const redirectURL = window.sessionStorage.getItem(SESSION_REDIRECT_URL);
  if (redirectURL) {
    window.sessionStorage.removeItem(SESSION_REDIRECT_URL);
    if (redirectURL !== '/' && redirectURL !== '/home')
      navigate(redirectURL, { replace: true });
  }

  if (isLoading) {
    return (
      // Don't render I18nProvider until i18n is activated

      // eslint-disable-next-line i18next/no-literal-string
      <div>Loading...</div>
    );
  }

  return (
    <I18nProvider i18n={i18n}>
      <SessionProvider>
        <Routes>
          <Route
            path="/login"
            element={<Login isAuthenticated={isAuthenticated} />}
          />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <ConfigProvider>
                  <RenderAppContainer />
                </ConfigProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
      </SessionProvider>
    </I18nProvider>
  );
}

export default () => (
  <HashRouter>
    <App />
  </HashRouter>
);
