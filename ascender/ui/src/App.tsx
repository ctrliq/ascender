import React, {
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
import { QueryClientProvider } from '@tanstack/react-query';
import { Card, PageSection } from '@patternfly/react-core';
import { ConfigProvider, useUserProfile } from 'contexts/Config';
import { SessionProvider, useSession } from 'contexts/Session';
import AppContainer from 'components/AppContainer';
import ContentError from 'components/ContentError';
import { DelayedContentLoading } from 'components/ContentLoading';
import NotFound from 'screens/NotFound';
import Login from 'screens/Login';
import { isAuthenticated } from 'util/auth';
import { getLanguageWithoutRegionCode } from 'util/language';
import type { AppRouteGroup } from './routeConfig';
import { dynamicActivate, locales } from './i18nLoader';
import getRouteConfig from './routeConfig';
import { getStoredThemeId, applyTheme } from './themeRegistry';
import { SESSION_REDIRECT_URL } from './constants';
import queryClient from './queryClient';

const Metrics = React.lazy(() => import('screens/Metrics'));

export interface ErrorFallbackProps {
  error: unknown;
  [key: string]: unknown;
}

function ErrorFallback({ error }: ErrorFallbackProps) {
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

/*
 * The addresses each screen answered to before the rail was renamed, and the
 * one it answers to now. A job output link is the most shared address in the
 * product, so the old shapes go on working: they land on the new address with
 * whatever followed them, and the address bar then says the new one.
 */
const RENAMED_ROUTES: [string, string][] = [
  ['/jobs', '/runs'],
  ['/workflow_approvals', '/approvals'],
  ['/notification_templates', '/notifications'],
  ['/management_jobs', '/cleanup_jobs'],
  // Its name for a while before the rail called these cleanup jobs.
  ['/data_retention', '/cleanup_jobs'],
  ['/topology_view', '/topology'],
  // The container groups, which are a tab beside the instances rather than a
  // list inside the instance groups.
  ['/instance_groups/container_group', '/container_groups'],
  // The settings pages, which the rail names on their own rather than under a
  // settings heading, so their addresses no longer carry one either. The index
  // they used to be listed on has gone with the heading: the rail is the list.
  ['/settings/ui', '/appearance'],
  ['/settings/miscellaneous_system', '/system'],
  ['/settings/miscellaneous_authentication', '/authentication/session'],
  ['/settings/jobs', '/job_settings'],
  ['/settings/logging', '/logging'],
  ['/settings/troubleshooting', '/troubleshooting'],
  ['/settings/azure', '/authentication/azure'],
  ['/settings/github', '/authentication/github'],
  ['/settings/google_oauth2', '/authentication/google_oauth2'],
  ['/settings/ldap', '/authentication/ldap'],
  ['/settings/oidc', '/authentication/oidc'],
  ['/settings/saml', '/authentication/saml'],
  ['/settings', '/appearance'],
];

/*
 * Settings pages for sign in methods that have been taken out, RADIUS and
 * TACACS+. Nothing answers at their addresses any more, and passing the rest
 * on as a rename does would land on a page with nothing of theirs. The
 * authentication page is where a bookmark to either was headed, and it lists
 * the methods that remain. Matched ahead of /settings because the router
 * ranks the longer address first, not because of their order here.
 */
const REMOVED_ROUTES: [string, string][] = [
  ['/settings/radius', '/authentication'],
  ['/settings/tacacsplus', '/authentication'],
];

export interface RenamedRouteProps {
  from: string;
  to: string;
}

/** Sends an old address to its new one, keeping everything that followed it. */
export function RenamedRoute({ from, to }: RenamedRouteProps) {
  const { pathname, search, hash } = useLocation();
  return (
    <Navigate
      replace
      to={`${to}${pathname.slice(from.length)}${search}${hash}`}
    />
  );
}

export interface AuthorizedRoutesProps {
  routeConfig: AppRouteGroup[];
}

export const AuthorizedRoutes = ({ routeConfig }: AuthorizedRoutesProps) => (
  <Suspense fallback={<DelayedContentLoading />}>
    <Routes>
      {routeConfig
        .flatMap(({ routes }) => routes)
        // An entry with no screen is a link in the rail to a page another
        // route already mounts, the settings pages among them.
        .filter(({ screen }) => Boolean(screen))
        .map(({ path, screen }) => {
          const Screen = screen as React.ComponentType;
          return (
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
          );
        })
        .concat(
          RENAMED_ROUTES.map(([from, to]) => (
            <Route
              key={from}
              path={`${from}/*`}
              element={<RenamedRoute from={from} to={to} />}
            />
          ))
        )
        .concat(
          REMOVED_ROUTES.map(([from, to]) => (
            <Route
              key={from}
              path={`${from}/*`}
              element={<Navigate replace to={to} />}
            />
          ))
        )
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
  </Suspense>
);

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
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
    // The installation's default, mirrored by the Config context. It sits above
    // the browser so an install can be set to one language for everyone, and
    // below the account's own choice so it never overrides a person.
    localStorage.getItem('default_language') ||
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
  <QueryClientProvider client={queryClient}>
    <HashRouter>
      <App />
    </HashRouter>
  </QueryClientProvider>
);
