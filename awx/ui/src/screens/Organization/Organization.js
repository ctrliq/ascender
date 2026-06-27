import React, { useCallback, useEffect, useRef } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams } from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import useRequest from 'hooks/useRequest';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import NotificationList from 'components/NotificationList/NotificationList';
import { ResourceAccessList } from 'components/ResourceAccessList';
import { OrganizationsAPI } from 'api';
import OrganizationDetail from './OrganizationDetail';
import OrganizationEdit from './OrganizationEdit';
import OrganizationTeams from './OrganizationTeams';
import OrganizationExecEnvList from './OrganizationExecEnvList';

function Organization({ setBreadcrumb, me }) {
  const location = useLocation();
  const { id: organizationId } = useParams();
  const initialUpdate = useRef(true);

  const {
    result: { organization },
    isLoading: organizationLoading,
    error: organizationError,
    request: loadOrganization,
  } = useRequest(
    useCallback(async () => {
      const [{ data }, credentialsRes] = await Promise.all([
        OrganizationsAPI.readDetail(organizationId),
        OrganizationsAPI.readGalaxyCredentials(organizationId),
      ]);
      data.galaxy_credentials = credentialsRes.data.results;
      setBreadcrumb(data);

      return {
        organization: data,
      };
    }, [setBreadcrumb, organizationId]),
    {
      organization: null,
    }
  );

  const {
    result: { isNotifAdmin, isAuditorOfThisOrg, isAdminOfThisOrg },
    isLoading: rolesLoading,
    error: rolesError,
    request: loadRoles,
  } = useRequest(
    useCallback(async () => {
      const [notifAdminRes, auditorRes, adminRes] = await Promise.all([
        OrganizationsAPI.read({
          page_size: 1,
          role_level: 'notification_admin_role',
        }),
        OrganizationsAPI.read({
          id: organizationId,
          role_level: 'auditor_role',
        }),
        OrganizationsAPI.read({
          id: organizationId,
          role_level: 'admin_role',
        }),
      ]);

      return {
        isNotifAdmin: notifAdminRes.data.results.length > 0,
        isAuditorOfThisOrg: auditorRes.data.results.length > 0,
        isAdminOfThisOrg: adminRes.data.results.length > 0,
      };
    }, [organizationId]),
    {
      isNotifAdmin: false,
      isAuditorOfThisOrg: false,
      isAdminOfThisOrg: false,
    }
  );
  useEffect(() => {
    loadOrganization();
    loadRoles();
  }, [loadOrganization, loadRoles]);

  useEffect(() => {
    if (initialUpdate.current) {
      initialUpdate.current = false;
      return;
    }

    if (location.pathname === `/organizations/${organizationId}/details`) {
      loadOrganization();
    }
  }, [loadOrganization, organizationId, location.pathname]);

  const canSeeNotificationsTab =
    me.is_system_auditor || isNotifAdmin || isAuditorOfThisOrg;
  const canToggleNotifications =
    isNotifAdmin &&
    (me.is_system_auditor || isAuditorOfThisOrg || isAdminOfThisOrg);
  const { t } = useLingui();

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Organizations`}
        </>
      ),
      link: `/organizations`,
      id: 99,
      persistentFilterKey: 'organizations',
    },
    {
      name: t`Details`,
      link: `/organizations/${organizationId}/details`,
      id: 0,
    },
    {
      name: t`Access`,
      link: `/organizations/${organizationId}/access`,
      id: 1,
    },
    { name: t`Teams`, link: `/organizations/${organizationId}/teams`, id: 2 },
    {
      name: t`Execution Environments`,
      link: `/organizations/${organizationId}/execution_environments`,
      id: 4,
    },
  ];

  if (canSeeNotificationsTab) {
    tabsArray.push({
      name: t`Notifications`,
      link: `/organizations/${organizationId}/notifications`,
      id: 3,
    });
  }

  let showCardHeader = true;

  if (location.pathname.endsWith('edit')) {
    showCardHeader = false;
  }

  if (!organizationLoading && organizationError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={organizationError}>
            {organizationError.response.status === 404 && (
              <span>
                {t`Organization not found.`}{' '}
                <Link to="/organizations">
                  {t`View all Organizations.`}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  if (!rolesLoading && rolesError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={rolesError} />
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Routes>
          <Route index element={<Navigate to="details" replace />} />
          {organization && (
            <Route
              path="edit"
              element={<OrganizationEdit organization={organization} />}
            />
          )}
          {organization && (
            <Route
              path="details"
              element={<OrganizationDetail organization={organization} />}
            />
          )}
          {organization && (
            <Route
              path="access"
              element={
                <ResourceAccessList
                  resource={organization}
                  apiModel={OrganizationsAPI}
                />
              }
            />
          )}
          <Route
            path="teams"
            element={<OrganizationTeams id={Number(organizationId)} />}
          />
          {canSeeNotificationsTab && (
            <Route
              path="notifications"
              element={
                <NotificationList
                  id={Number(organizationId)}
                  canToggleNotifications={canToggleNotifications}
                  apiModel={OrganizationsAPI}
                  showApprovalsToggle
                />
              }
            />
          )}
          {organization && (
            <Route
              path="execution_environments"
              element={<OrganizationExecEnvList organization={organization} />}
            />
          )}
          <Route
            path="*"
            element={
              !organizationLoading && !rolesLoading ? (
                <ContentError isNotFound>
                  {organizationId && (
                    <Link to={`/organizations/${organizationId}/details`}>
                      {t`View Organization Details`}
                    </Link>
                  )}
                </ContentError>
              ) : null
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default Organization;
export { Organization as _Organization };
