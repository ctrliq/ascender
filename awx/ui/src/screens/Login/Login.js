//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Navigate } from 'routerCompat';

import { useLingui } from '@lingui/react/macro';
import { Formik } from 'formik';
import DOMPurify from 'dompurify';

import {
  Alert,
  Brand,
  LoginMainFooterLinksItem, Button,
  LoginForm,
  Login as PFLogin,
  LoginHeader,
  LoginFooter,
  LoginMainBody,
  LoginMainFooter,
  Tooltip,
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
      </LoginMainBody>
      <LoginMainFooter
        socialMediaLoginContent={
          <>
            {socialAuthOptions &&
              Object.keys(socialAuthOptions).map((authKey) => {
                const loginUrl = socialAuthOptions[authKey].login_url;
                if (authKey === 'azuread-oauth2') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-azure"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip content={t`Sign in with Azure AD`}>
                        <AzureIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'azuread-tenant-oauth2') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-azure-tenant"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip
                        content={t`Sign in with Azure AD Tenant`}
                      >
                        <AzureIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-github"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip content={t`Sign in with GitHub`}>
                        <GithubIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-org') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-github-org"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip
                        content={t`Sign in with GitHub Organizations`}
                      >
                        <GithubIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-team') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-github-team"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip content={t`Sign in with GitHub Teams`}>
                        <GithubIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-enterprise') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-github-enterprise"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip
                        content={t`Sign in with GitHub Enterprise`}
                      >
                        <GithubIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-enterprise-org') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-github-enterprise-org"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip
                        content={t`Sign in with GitHub Enterprise Organizations`}
                      >
                        <GithubIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-enterprise-team') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-github-enterprise-team"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip
                        content={t`Sign in with GitHub Enterprise Teams`}
                      >
                        <GithubIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'google-oauth2') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-google"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip content={t`Sign in with Google`}>
                        <GoogleIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'oidc') {
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-oidc"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip content={t`Sign in with OIDC`}>
                        <UserCircleIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }
                if (authKey.startsWith('saml')) {
                  const samlIDP = authKey.split(':')[1] || null;
                  return (
                    <LoginMainFooterLinksItem data-codemods="true"
                      data-cy="social-auth-saml"

                      key={authKey}
                      onClick={setSessionRedirect}
                    ><Button variant="link" component="a" href={loginUrl}>
                      <Tooltip
                        content={
                          samlIDP
                            ? t`Sign in with SAML ${samlIDP}`
                            : t`Sign in with SAML`
                        }
                      >
                        <UserCircleIcon size="lg" />
                      </Tooltip>
                    </Button></LoginMainFooterLinksItem>
                  );
                }

                return null;
              })}
              {Footer}
          </>
        }
      />
    </Login>
  );
}

export default AWXLogin;
export { AWXLogin as _AWXLogin };
