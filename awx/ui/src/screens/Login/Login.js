//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
/* eslint-disable react/jsx-no-useless-fragment */
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Redirect, withRouter } from 'react-router-dom';

import { useLingui } from '@lingui/react/macro';
import { Formik } from 'formik';
import styled from 'styled-components';
import DOMPurify from 'dompurify';

import {
  Alert,
  Brand,
  LoginMainFooterLinksItem,
  LoginForm,
  Login as PFLogin,
  LoginHeader,
  LoginFooter,
  LoginMainHeader,
  LoginMainBody,
  LoginMainFooter,
  Tooltip,
} from '@patternfly/react-core';

import { LucideIconLoaderCircle as AzureIcon } from '@ctrliq/quantic-react';
import { LucideIconLoaderCircle as GoogleIcon } from '@ctrliq/quantic-react';
import { LucideIconGithub as GithubIcon } from '@ctrliq/quantic-react';
import { LucideIconUserRound as UserCircleIcon } from '@ctrliq/quantic-react';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { AuthAPI, RootAPI, MeAPI } from 'api';
import { useSession } from 'contexts/Session';
import LoadingSpinner from 'components/LoadingSpinner';
import { SESSION_REDIRECT_URL, SESSION_USER_ID } from '../../constants';

const loginLogoSrc = 'static/media/Ascender_logo.svg';

const Login = styled(PFLogin)`
  & {
    --pf-c-login__container--MaxWidth: var(--quantic-spacing-96);
    --pf-c-login__main-body--PaddingRight: var(--quantic-spacing-8);
    --pf-c-login__main-body--PaddingLeft: var(--quantic-spacing-8);
  }

  & .pf-c-login__main {
    background-color: var(--quantic-bg-secondary);
    border-radius: var(--quantic-radius-md);
    border: 1px solid var(--quantic-border-primary);
  }

  & .pf-c-brand {
    max-width: var(--quantic-spacing-48);
    display: block;
    margin: 0 auto;
  }
`;

function AWXLogin({ alt, isAuthenticated }) {
  const { t } = useLingui();
  const [userId, setUserId] = useState(null);
  const { authRedirectTo, isSessionExpired, isRedirectLinkReceived } =
    useSession();
  const isNewUser = useRef(true);
  const hasVerifiedUser = useRef(false);

  const {
    isLoading: isCustomLoginInfoLoading,
    request: fetchCustomLoginInfo,
    result: { brandName, logo, loginInfo, socialAuthOptions },
  } = useRequest(
    useCallback(async () => {
      const [
        {
          data: { custom_logo, custom_login_info },
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
      const logoSrc = custom_logo
        ? `data:image/jpeg;${custom_logo}`
        : loginLogoSrc;

      return {
        brandName: BRAND_NAME,
        logo: logoSrc,
        loginInfo: custom_login_info,
        socialAuthOptions: authData,
      };
    }, []),
    {
      brandName: null,
      logo: loginLogoSrc,
      loginInfo: null,
      socialAuthOptions: {},
    }
  );

  useEffect(() => {
    fetchCustomLoginInfo();
  }, [fetchCustomLoginInfo]);

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
        setUserId(data.results[0].id);
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

  const setLocalStorageAndRedirect = useCallback(() => {
    if (userId && !hasVerifiedUser.current) {
      const verifyIsNewUser = () => {
        const previousUserId = JSON.parse(
          window.localStorage.getItem(SESSION_USER_ID)
        );
        if (previousUserId === null) {
          return true;
        }
        return userId.toString() !== previousUserId.toString();
      };
      isNewUser.current = verifyIsNewUser();
      hasVerifiedUser.current = true;
      window.localStorage.setItem(SESSION_USER_ID, JSON.stringify(userId));
    }
  }, [userId]);

  useEffect(() => {
    setLocalStorageAndRedirect();
  }, [userId, setLocalStorageAndRedirect]);

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
  if (userId && hasVerifiedUser.current) {
    const redirect =
      isNewUser.current && !isRedirectLinkReceived ? '/home' : authRedirectTo;

    return <Redirect to={redirect} />;
  }
  return (
    <Login headerfooter={Footer}>
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
              helperText={authError ? helperText : null}
              isLoginButtonDisabled={isAuthenticating}
              isValidPassword={!authError}
              isValidUsername={!authError}
              loginButtonLabel={t`Log In`}
              onChangePassword={(val) => {
                formik.setFieldValue('password', val);
                dismissAuthError();
              }}
              onChangeUsername={(val) => {
                formik.setFieldValue('username', val);
                dismissAuthError();
              }}
              onLoginButtonClick={formik.handleSubmit}
              passwordLabel={t`Password`}
              passwordValue={formik.values.password}
              showHelperText={authError}
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
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-azure"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip content={t`Sign in with Azure AD`}>
                        <AzureIcon size={24} data-original-icon="AzureIcon" />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github') {
                  return (
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-github"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip content={t`Sign in with GitHub`}>
                        <GithubIcon size={24} data-original-icon="GithubIcon" />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-org') {
                  return (
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-github-org"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip content={t`Sign in with GitHub Organizations`}>
                        <GithubIcon size={24} data-original-icon="GithubIcon" />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-team') {
                  return (
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-github-team"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip content={t`Sign in with GitHub Teams`}>
                        <GithubIcon size={24} data-original-icon="GithubIcon" />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-enterprise') {
                  return (
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-github-enterprise"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip content={t`Sign in with GitHub Enterprise`}>
                        <GithubIcon size={24} data-original-icon="GithubIcon" />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-enterprise-org') {
                  return (
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-github-enterprise-org"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip
                        content={t`Sign in with GitHub Enterprise Organizations`}
                      >
                        <GithubIcon size={24} data-original-icon="GithubIcon" />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'github-enterprise-team') {
                  return (
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-github-enterprise-team"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip
                        content={t`Sign in with GitHub Enterprise Teams`}
                      >
                        <GithubIcon size={24} data-original-icon="GithubIcon" />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'google-oauth2') {
                  return (
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-google"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip content={t`Sign in with Google`}>
                        <GoogleIcon size={24} data-original-icon="GoogleIcon" />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }
                if (authKey === 'oidc') {
                  return (
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-oidc"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip content={t`Sign in with OIDC`}>
                        <UserCircleIcon
                          size={24}
                          data-original-icon="UserCircleIcon"
                        />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }
                if (authKey.startsWith('saml')) {
                  const samlIDP = authKey.split(':')[1] || null;
                  return (
                    <LoginMainFooterLinksItem
                      data-cy="social-auth-saml"
                      href={loginUrl}
                      key={authKey}
                      onClick={setSessionRedirect}
                    >
                      <Tooltip
                        content={
                          samlIDP
                            ? t`Sign in with SAML ${samlIDP}`
                            : t`Sign in with SAML`
                        }
                      >
                        <UserCircleIcon
                          size={24}
                          data-original-icon="UserCircleIcon"
                        />
                      </Tooltip>
                    </LoginMainFooterLinksItem>
                  );
                }

                return null;
              })}
          </>
        }
      />
    </Login>
  );
}

export default withRouter(AWXLogin);
export { AWXLogin as _AWXLogin };
