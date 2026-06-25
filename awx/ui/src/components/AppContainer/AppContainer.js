import React, { useState, useEffect } from 'react';

import {
	Button,
	Masthead,
	MastheadBrand,
	MastheadContent,
	MastheadMain,
	MastheadToggle,
	Nav,
	NavList,
	Page,
	PageSidebar, PageSidebarBody,
	PageToggleButton
} from '@patternfly/react-core';
import { BarsIcon } from '@patternfly/react-icons';
import { Plural, Trans, useLingui } from '@lingui/react/macro';

import styled from 'styled-components';

import { useConfig, useAuthorizedPath } from 'contexts/Config';
import { useSession } from 'contexts/Session';
import issuePendoIdentity from 'util/issuePendoIdentity';
import About from '../About';
import BrandLogo from './BrandLogo';
import NavExpandableGroup from './NavExpandableGroup';
import PageHeaderToolbar from './PageHeaderToolbar';
import AlertModal from '../AlertModal';

const StyledMastheadBrand = styled(MastheadBrand)`
  color: inherit;
  &:hover {
    color: inherit;
  }
`;

function AppContainer({ navRouteConfig = [], children }) {
  const { t } = useLingui();
  const config = useConfig();
  const { logout, handleSessionContinue, sessionCountdown } = useSession();

  const isReady = !!config.license_info;
  const isSidebarVisible = useAuthorizedPath();
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

  const handleAboutModalOpen = () => setIsAboutModalOpen(true);
  const handleAboutModalClose = () => setIsAboutModalOpen(false);

  useEffect(() => {
    if ('analytics_status' in config) {
      issuePendoIdentity(config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.analytics_status]);

  const brandName = config?.license_info?.product_name;
  const alt = brandName
    ? t`${brandName} logo`
    : t`brand logo`;

  const header = (
    <Masthead>
      <MastheadToggle>
        <PageToggleButton variant="plain" aria-label={t`Global navigation`}>
          <BarsIcon />
        </PageToggleButton>
      </MastheadToggle>
      <MastheadMain>
        <StyledMastheadBrand component="a" href="/">
          <BrandLogo alt={alt} />
        </StyledMastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <PageHeaderToolbar
          loggedInUser={config?.me}
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
        <MastheadBrand component="a" href="/">
          <BrandLogo alt={alt} />
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
    <PageSidebar theme="dark" >
<PageSidebarBody>

        <Nav

          aria-label={t`Navigation`}
          theme="dark"
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
      <Page
        isManagedSidebar={isSidebarVisible}
        header={isSidebarVisible ? header : simpleHeader}
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
