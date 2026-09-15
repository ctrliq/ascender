import React, { useState, useEffect } from 'react';

import {
  Button,
  Masthead,
  MastheadLogo,
  MastheadContent,
  MastheadMain,
  MastheadToggle,
  MastheadBrand,
  Nav,
  NavList,
  Page,
  PageSidebar,
  PageSidebarBody,
  PageToggleButton,
} from '@patternfly/react-core';

import { Plural, Trans, useLingui } from '@lingui/react/macro';

import { useConfig, useAuthorizedPath } from 'contexts/Config';
import { useSession } from 'contexts/Session';
import issuePendoIdentity from 'util/issuePendoIdentity';
import type { PendoConfig } from 'util/issuePendoIdentity';
import useBrandName from 'hooks/useBrandName';
import type { AppRouteGroup } from '../../routeConfig';
import About from '../About';
import BrandLogo from './BrandLogo';
import NavExpandableGroup from './NavExpandableGroup';
import PageHeaderToolbar from './PageHeaderToolbar';
import AlertModal from '../AlertModal';
import './AppContainer.css';

export interface AppContainerProps {
  navRouteConfig?: AppRouteGroup[];
  children?: React.ReactNode;
  [key: string]: unknown;
}

function AppContainer({ navRouteConfig = [], children }: AppContainerProps) {
  const { t } = useLingui();
  const config = useConfig();
  const { logout, handleSessionContinue, sessionCountdown } = useSession();

  // The config context starts empty and fills once /api/v2/config/ answers.
  // version is the field that says so; it used to be license_info, which
  // meant the app waited on a licence to decide the config had loaded.
  const isReady = !!config.version;
  const isSidebarVisible = useAuthorizedPath();
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

  const handleAboutModalOpen = () => setIsAboutModalOpen(true);
  const handleAboutModalClose = () => setIsAboutModalOpen(false);

  useEffect(() => {
    if ('analytics_status' in config) {
      // The guard above is what says the config has been read; PendoConfig
      // names the fields pendo is given out of it.
      issuePendoIdentity(config as unknown as PendoConfig);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.analytics_status]);

  const brandName = useBrandName();
  const alt = brandName ? t`${brandName} logo` : t`brand logo`;

  const header = (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton
            isHamburgerButton
            variant="plain"
            aria-label={t`Global navigation`}
          />
        </MastheadToggle>
        <MastheadBrand
          className="ascender-app-container__styled-masthead-brand"
          href="/"
        >
          <BrandLogo alt={alt} />
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <PageHeaderToolbar
          loggedInUser={config?.me as Record<string, unknown>}
          isAboutDisabled={!config?.version}
          onAboutClick={handleAboutModalOpen}
          onLogoutClick={logout}
        />
      </MastheadContent>
    </Masthead>
  );

  const simpleHeader = config.isLoading ? null : (
    <Masthead>
      <MastheadMain>
        <MastheadBrand data-codemods>
          <MastheadLogo data-codemods component="a" href="/">
            <BrandLogo alt={alt} />
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Button onClick={logout} variant="tertiary" ouiaId="logout">
          <Trans>Logout</Trans>
        </Button>
      </MastheadContent>
    </Masthead>
  );

  const sidebar = (
    <PageSidebar>
      <PageSidebarBody>
        <Nav
          aria-label={t`Navigation`}

          ouiaId="sidebar-navigation"
        >
          <NavList>
            {navRouteConfig.map(({ groupId, groupTitle, routes }) => (
              <NavExpandableGroup
                key={groupId}
                groupId={groupId}
                groupTitle={groupTitle}
                routes={routes}
              />
            ))}
          </NavList>
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  );

  return (
    <>
      {/* isManagedSidebar must be set from the very first render: Page only
          attaches its resize observer in componentDidMount when the prop is
          already true, and isSidebarVisible is false until the config loads.
          Without it, the mobile nav toggle never works. */}
      <Page
        isManagedSidebar
        masthead={isSidebarVisible ? header : simpleHeader}
        sidebar={isSidebarVisible && sidebar}
      >
        {isReady ? children : null}
      </Page>
      <About
        version={config?.version}
        isOpen={isAboutModalOpen}
        onClose={handleAboutModalClose}
      />
      <AlertModal
        ouiaId="session-expiration-modal"

        title={t`Your session is about to expire`}
        isOpen={sessionCountdown && sessionCountdown > 0}
        onClose={logout}
        showClose={false}
        variant="warning"
        actions={[
          <Button
            ouiaId="session-expiration-continue-button"
            key="confirm"
            variant="primary"
            onClick={handleSessionContinue}
          >
            <Trans>Continue</Trans>
          </Button>,
          <Button
            ouiaId="session-expiration-logout-button"
            key="logout"
            variant="secondary"
            onClick={logout}
          >
            <Trans>Logout</Trans>
          </Button>,
        ]}
      >
        <Plural
          value={sessionCountdown}
          one="You will be logged out in # second due to inactivity"
          other="You will be logged out in # seconds due to inactivity"
        />
      </AlertModal>
    </>
  );
}

export { AppContainer as _AppContainer };
export default AppContainer;
