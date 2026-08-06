//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { Formik } from 'formik';
import DOMPurify from 'dompurify';

import {
  Alert,
  Brand,
  Button,
  LoginForm,
  Login as PFLogin,
  LoginHeader,
  LoginFooter,
  LoginMainBody,
  LoginMainFooter,
} from '@patternfly/react-core';

import {
  AzureIcon,
  GoogleIcon,
  GithubIcon,
  UserCircleIcon,
} from '@patternfly/react-icons';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { AuthAPI, RootAPI, MeAPI } from 'api';
import { useSession } from 'contexts/Session';
import { applyTheme, getSavedThemeId, clearSessionTheme } from 'themeRegistry';
import LoadingSpinner from 'components/LoadingSpinner';
import { SESSION_REDIRECT_URL, SESSION_USER_ID } from '../../constants';
import '../../login.css';

const loginLogoSrc = 'static/media/Ascender_logo.svg';

const Login = PFLogin;

function AWXLogin({ alt, isAuthenticated }) {
  const { t } = useLingui();
  const [userId, setUserId] = useState(null);
  const { authRedirectTo, isSessionExpired, isRedirectLinkReceived } =
    useSession();
  const isNewUser = useRef(true);

  useEffect(() => {
    clearSessionTheme();
    applyTheme('default', false);
    return () => {
      applyTheme(getSavedThemeId());
    };
  }, []);

  const {
    isLoading: isCustomLoginInfoLoading,
    request: fetchCustomLoginInfo,
    result: { brandName, logo, loginInfo, customTitle, socialAuthOptions },
  } = useRequest(
    useCallback(async () => {
      const [
        {
          data: { custom_logo, custom_login_info, custom_title },
        },
        {
          data: { BRAND_NAME },
        },
        { data: authData },
      ] = await Promise.all([
        RootAPI.read(),
        RootAPI.readAssetVariables(),
        AuthAPI.read(),
      ]);
      const logoSrc = custom_logo || loginLogoSrc;

      return {
        brandName: BRAND_NAME,
        logo: logoSrc,
        loginInfo: custom_login_info,
        customTitle: custom_title,
        socialAuthOptions: authData,
      };
    }, []),
    {
      brandName: null,
      logo: loginLogoSrc,
      loginInfo: null,
      customTitle: null,
      socialAuthOptions: {},
    }
  );

  useEffect(() => {
    fetchCustomLoginInfo();
  }, [fetchCustomLoginInfo]);

  useEffect(() => {
    if (brandName === null) return;
    document.title = customTitle || brandName;
  }, [brandName, customTitle]);

  const {
    isLoading: isAuthenticating,
    error: authenticationError,
    request: authenticate,
  } = useRequest(
    useCallback(async ({ username, password }) => {
      await RootAPI.login(username, password);
    }, [])
  );

  const { error: authError, dismissError: dismissAuthError } =
    useDismissableError(authenticationError);

  const { isLoading: isUserIdLoading, request: fetchUserId } = useRequest(
    useCallback(async () => {
      if (isAuthenticated(document.cookie)) {
        const { data } = await MeAPI.read();
        const newUserId = data.results[0].id;
        const cacheKey = `isNewUser-${newUserId}`;
        const cached = window.sessionStorage.getItem(cacheKey);
        if (cached !== null) {
          isNewUser.current = cached === 'true';
        } else {
          const previousUserId = JSON.parse(
            window.localStorage.getItem(SESSION_USER_ID)
          );
          isNewUser.current =
            previousUserId === null ||
            newUserId.toString() !== previousUserId.toString();
          window.sessionStorage.setItem(cacheKey, String(isNewUser.current));
        }
        window.localStorage.setItem(SESSION_USER_ID, JSON.stringify(newUserId));
        setUserId(newUserId);
      }
    }, [isAuthenticated])
  );

  const handleSubmit = async (values) => {
    dismissAuthError();
    await authenticate(values);
    await fetchUserId();
  };

  useEffect(() => {
    fetchUserId();
  }, [fetchUserId]);

  let helperText;
  if (authError?.response?.status === 401) {
    helperText = t`Invalid username or password. Please try again.`;
  } else {
    helperText = t`There was a problem logging in. Please try again.`;
  }

  const HeaderBrand = (
    <Brand data-cy="brand-logo" src={logo} alt={alt || brandName} />
  );
  const Header = <LoginHeader headerBrand={HeaderBrand} />;
  const Footer = (
    <LoginFooter
      data-cy="login-footer"
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(loginInfo),
      }}
    />
  );

  const setSessionRedirect = () => {
    window.sessionStorage.setItem(SESSION_REDIRECT_URL, authRedirectTo);
  };

  const socialAuthProviders = {
    'azuread-oauth2': {
      dataCy: 'social-auth-azure',
      icon: AzureIcon,
      label: t`Sign in with Azure AD`,
    },
    'azuread-tenant-oauth2': {
      dataCy: 'social-auth-azure-tenant',
      icon: AzureIcon,
      label: t`Sign in with Azure AD Tenant`,
    },
    github: {
      dataCy: 'social-auth-github',
      icon: GithubIcon,
      label: t`Sign in with GitHub`,
    },
    'github-org': {
      dataCy: 'social-auth-github-org',
      icon: GithubIcon,
      label: t`Sign in with GitHub Organizations`,
    },
    'github-team': {
      dataCy: 'social-auth-github-team',
      icon: GithubIcon,
      label: t`Sign in with GitHub Teams`,
    },
    'github-enterprise': {
      dataCy: 'social-auth-github-enterprise',
      icon: GithubIcon,
      label: t`Sign in with GitHub Enterprise`,
    },
    'github-enterprise-org': {
      dataCy: 'social-auth-github-enterprise-org',
      icon: GithubIcon,
      label: t`Sign in with GitHub Enterprise Organizations`,
    },
    'github-enterprise-team': {
      dataCy: 'social-auth-github-enterprise-team',
      icon: GithubIcon,
      label: t`Sign in with GitHub Enterprise Teams`,
    },
    'google-oauth2': {
      dataCy: 'social-auth-google',
      icon: GoogleIcon,
      label: t`Sign in with Google`,
    },
    oidc: {
      dataCy: 'social-auth-oidc',
      icon: UserCircleIcon,
      label: t`Sign in with OIDC`,
    },
  };

  const getSocialAuthProvider = (authKey) => {
    if (!authKey.startsWith('saml')) {
      return socialAuthProviders[authKey];
    }
    const samlIDP = authKey.split(':')[1] || null;
    return {
      dataCy: 'social-auth-saml',
      icon: UserCircleIcon,
      label: samlIDP ? t`Sign in with SAML ${samlIDP}` : t`Sign in with SAML`,
    };
  };

  const socialAuthEntries = Object.keys(socialAuthOptions || {})
    .map((authKey) => {
      const provider = getSocialAuthProvider(authKey);
      if (!provider) {
        return null;
      }
      const { label } = socialAuthOptions[authKey];
      return {
        authKey,
        ...provider,
        label: label ? t`Sign in with ${label}` : provider.label,
      };
    })
    .filter(Boolean);

  if (isCustomLoginInfoLoading) {
    return null;
  }
  if (isUserIdLoading) {
    return <LoadingSpinner />;
  }
  if (userId) {
    const redirect =
      isNewUser.current && !isRedirectLinkReceived ? '/home' : authRedirectTo;

    return <Navigate to={redirect} />;
  }
  return (
    <Login className="ascender-login">
      <LoginMainBody>
        {isSessionExpired.current ? (
          <Alert
            variant="warning"
            isInline
            title={t`Your session has expired. Please log in to continue where you left off.`}
            ouiaId="session-expired-warning-alert"
          />
        ) : null}
        {Header}
        <Formik
          initialValues={{
            password: '',
            username: '',
          }}
          onSubmit={handleSubmit}
        >
          {(formik) => (
            <LoginForm
              autoComplete="off"
              data-cy="login-form"
              className={authError ? 'pf-m-error' : ''}
              showHelperText={!!authError}
              helperText={authError ? helperText : null}
              isLoginButtonDisabled={isAuthenticating}
              isValidPassword={!authError}
              isValidUsername={!authError}
              loginButtonLabel={t`Log In`}
              onChangePassword={(_event, val) => {
                formik.setFieldValue('password', val);
                dismissAuthError();
              }}
              onChangeUsername={(_event, val) => {
                formik.setFieldValue('username', val);
                dismissAuthError();
              }}
              onLoginButtonClick={formik.handleSubmit}
              passwordLabel={t`Password`}
              passwordValue={formik.values.password}
              usernameLabel={t`Username`}
              usernameValue={formik.values.username}
            />
          )}
        </Formik>
        {socialAuthEntries.length > 0 && (
          <div className="ascender-login__sso">
            <div className="ascender-login__sso-separator">{t`or`}</div>
            {socialAuthEntries.map(({ authKey, dataCy, icon: Icon, label }) => (
              <Button
                key={authKey}
                data-cy={dataCy}
                variant="secondary"
                component="a"
                href={socialAuthOptions[authKey].login_url}
                isBlock
                icon={<Icon />}
                onClick={setSessionRedirect}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </LoginMainBody>
      <LoginMainFooter socialMediaLoginContent={<>{Footer}</>} />
    </Login>
  );
}

export default AWXLogin;
export { AWXLogin as _AWXLogin };
