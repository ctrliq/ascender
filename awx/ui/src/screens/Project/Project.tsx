import type { DetailedError, Untyped } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import { useConfig } from 'contexts/Config';
import useRequest from 'hooks/useRequest';
import RoutedTabs from 'components/RoutedTabs';
import type { RoutedTab } from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import NotificationList from 'components/NotificationList';
import { ResourceAccessList } from 'components/ResourceAccessList';
import { Schedules } from 'components/Schedule';
import RelatedTemplateList from 'components/RelatedTemplateList';
import { OrganizationsAPI, ProjectsAPI } from 'api';
import type { QSParams } from 'util/qs';
import ProjectDetail from './ProjectDetail';
import ProjectEdit from './ProjectEdit';

export interface ProjectProps {
  setBreadcrumb: (resource?: Untyped, nested?: Untyped) => void;
  [key: string]: unknown;
}

function Project({ setBreadcrumb }: ProjectProps) {
  const { t } = useLingui();
  const { me = {} } = useConfig();
  const { id } = useParams() as { id: string };
  const location = useLocation();

  const {
    request: fetchProjectAndRoles,
    result: { project, isNotifAdmin },
    isLoading: hasContentLoading,
    error: contentError,
  } = useRequest(
    useCallback(async () => {
      const [{ data }, notifAdminRes] = await Promise.all([
        ProjectsAPI.readDetail(id),
        OrganizationsAPI.read({
          page_size: 1,
          role_level: 'notification_admin_role',
        }),
      ]);

      if (
        data.webhook_service &&
        data.related?.webhook_key &&
        data.summary_fields?.user_capabilities?.edit
      ) {
        const {
          data: { webhook_key },
        } = await ProjectsAPI.readWebhookKey(id);

        data.webhook_key = webhook_key;
      }
      return {
        project: data,
        isNotifAdmin: notifAdminRes.data.results.length > 0,
      };
    }, [id]),
    {
      project: null,
      isNotifAdmin: false,
    }
  );

  useEffect(() => {
    fetchProjectAndRoles();
  }, [fetchProjectAndRoles, location.pathname]);

  useEffect(() => {
    if (project) {
      setBreadcrumb(project);
    }
  }, [project, setBreadcrumb]);

  const loadScheduleOptions = useCallback(
    () => ProjectsAPI.readScheduleOptions(project.id),
    [project]
  );

  const loadSchedules = useCallback(
    (params: QSParams) => ProjectsAPI.readSchedules(project.id, params),
    [project]
  );

  const canSeeNotificationsTab = me.is_system_auditor || isNotifAdmin;
  const canToggleNotifications = isNotifAdmin;
  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Projects`}
        </>
      ),
      link: `/projects`,
      persistentFilterKey: 'projects',
    },
    { name: t`Details`, link: `/projects/${id}/details` },
    { name: t`Access`, link: `/projects/${id}/access` },
    {
      name: t`Job Templates`,
      link: `/projects/${id}/job_templates`,
    },
  ];

  if (canSeeNotificationsTab) {
    tabsArray.push({
      name: t`Notifications`,
      link: `/projects/${id}/notifications`,
    });
  }
  if (project?.scm_type) {
    tabsArray.push({
      name: t`Schedules`,
      link: `/projects/${id}/schedules`,
    });
  }

  // Ids come from position rather than from the literals, since which tabs
  // exist depends on the project and on who is looking at it.
  const tabs: RoutedTab[] = tabsArray.map((tab, id) => ({ ...tab, id }));

  if (contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {(contentError as DetailedError).response?.status === 404 && (
              <span>
                {t`Project not found.`}{' '}
                <Link to="/projects">{t`View all Projects.`}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  const showCardHeader = !(
    location.pathname.endsWith('edit') ||
    location.pathname.includes('schedules/')
  );

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabs} />}
        {hasContentLoading && <ContentLoading />}
        {!hasContentLoading && project && (
          <Routes>
            <Route index element={<Navigate to="details" replace />} />
            <Route path="edit" element={<ProjectEdit project={project} />} />
            <Route
              path="details"
              element={<ProjectDetail project={project} />}
            />
            <Route
              path="access"
              element={
                <ResourceAccessList resource={project} apiModel={ProjectsAPI} />
              }
            />
            {canSeeNotificationsTab && (
              <Route
                path="notifications"
                element={
                  <NotificationList
                    id={Number(id)}
                    canToggleNotifications={canToggleNotifications}
                    apiModel={ProjectsAPI}
                  />
                }
              />
            )}
            <Route
              path="job_templates"
              element={
                <RelatedTemplateList
                  searchParams={{
                    project__id: project.id,
                  }}
                  resourceName={project.name}
                />
              }
            />
            {/* so the nested <Schedules> route tree can match */}
            {project?.scm_type && project.scm_type !== '' && (
              <Route
                path="schedules/*"
                element={
                  <Schedules
                    setBreadcrumb={setBreadcrumb}
                    resource={project}
                    apiModel={ProjectsAPI}
                    loadSchedules={loadSchedules}
                    loadScheduleOptions={loadScheduleOptions}
                  />
                }
              />
            )}
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  {id && (
                    <Link to={`/projects/${id}/details`}>
                      {t`View Project Details`}
                    </Link>
                  )}
                </ContentError>
              }
            />
          </Routes>
        )}
      </Card>
    </PageSection>
  );
}

export default Project;
export { Project as _Project };
