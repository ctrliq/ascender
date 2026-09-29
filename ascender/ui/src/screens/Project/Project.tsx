import type { DetailedError, SetBreadcrumb } from 'types/api';
import React, { useCallback, useEffect, useRef } from 'react';
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
import JobList from 'components/JobList';
import { OrganizationsAPI, ProjectsAPI } from 'api';
import type { QSParams } from 'util/qs';
import ProjectSyncButton from './shared/ProjectSyncButton';
import { readProjectFormOptions } from './shared/projectFormOptions';
import type { ProjectFormOptions } from './shared/projectFormOptions';
import ProjectDetail from './ProjectDetail';
import ProjectEdit from './ProjectEdit';

export interface ProjectProps {
  setBreadcrumb: SetBreadcrumb;
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

  /*
   * What the edit form needs before it can draw, none of it about this
   * project, so it is read once rather than again on every tab change, and
   * only for someone who can edit or who has opened the edit route. Read
   * alongside the project it was asked for again on every change of tab, and
   * a failure to read it replaced the whole page with an error although only
   * the form needs it; now only the edit route waits on it or reports it.
   */
  const isEditRoute = location.pathname.endsWith('/edit');
  const needsFormOptions =
    isEditRoute || Boolean(project?.summary_fields?.user_capabilities?.edit);
  const {
    request: fetchFormOptions,
    result: formOptions,
    error: formOptionsError,
  } = useRequest(
    useCallback(() => readProjectFormOptions(), []),
    null as ProjectFormOptions | null
  );
  const hasRequestedFormOptions = useRef(false);

  useEffect(() => {
    if (needsFormOptions && !hasRequestedFormOptions.current) {
      hasRequestedFormOptions.current = true;
      fetchFormOptions();
    }
  }, [needsFormOptions, fetchFormOptions]);

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
  ];

  /*
   * In the order every object's tabs come in: its own tabs first, here Job
   * Templates, the templates that use the project, then Notifications and
   * Schedules, and Runs last, so the tabs a project shares with a template
   * or an inventory sit in the same place on each.
   */
  tabsArray.push({
    name: t`Job Templates`,
    link: `/projects/${id}/job_templates`,
  });

  if (canSeeNotificationsTab) {
    tabsArray.push({
      name: t`Notifications`,
      link: `/projects/${id}/notifications`,
    });
  }
  /* A manual project is never updated, so it has no schedules and no runs. */
  if (project?.scm_type) {
    tabsArray.push(
      {
        name: t`Schedules`,
        link: `/projects/${id}/schedules`,
      },
      {
        name: t`Runs`,
        link: `/projects/${id}/runs`,
      }
    );
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

  // The edit route waits on what the form draws with, and alone reports it.
  let editElement: React.ReactNode = <ContentLoading />;
  if (formOptionsError) {
    editElement = <ContentError error={formOptionsError} />;
  } else if (project && formOptions) {
    editElement = <ProjectEdit project={project} formOptions={formOptions} />;
  }

  const showCardHeader = !(
    location.pathname.endsWith('edit') ||
    location.pathname.includes('schedules/')
  );

  /*
   * One loading animation, in the place the content will be. Drawn inside the
   * card it made the page arrive in pieces: a card and its tabs first, an
   * animation inside them, then the content. Asked with the project rather
   * than on its own, so a later read does not throw away a page already drawn.
   */
  if (hasContentLoading && !project) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabs} />}
        {project && (
          <Routes>
            <Route index element={<Navigate to="details" replace />} />
            <Route path="edit" element={editElement} />
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
            {project?.scm_type && (
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
            {project?.scm_type && (
              <Route
                path="runs"
                element={
                  /*
                   * Every update, including the ones a job launch started for
                   * itself, which are most of a project's history.
                   */
                  <JobList
                    defaultParams={{ unified_job_template: project.id }}
                    includeDependencySyncs
                    // Sync, as on the project's details, for whoever may.
                    runControl={
                      project.summary_fields?.user_capabilities?.start ? (
                        <ProjectSyncButton
                          projectId={project.id}
                          // The job in flight when there is one, as on the
                          // details, so a running sync is not offered again.
                          lastJobStatus={
                            (
                              project.summary_fields?.current_job ??
                              project.summary_fields?.last_job
                            )?.status ?? null
                          }
                          label={t`Run`}
                          tooltip={t`Sync Project`}
                        />
                      ) : (
                        // false, not null: null would bring back the general Run menu.
                        false
                      )
                    }
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
