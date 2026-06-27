import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';

import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import { Link, useLocation } from 'react-router';
import { Routes, Route, Navigate, useParams } from 'routerCompat';
import RoutedTabs from 'components/RoutedTabs';
import { useConfig } from 'contexts/Config';
import useRequest from 'hooks/useRequest';
import AppendBody from 'components/AppendBody';
import ContentError from 'components/ContentError';
import FullPage from 'components/FullPage';
import JobList from 'components/JobList';
import NotificationList from 'components/NotificationList';
import { Schedules } from 'components/Schedule';
import { ResourceAccessList } from 'components/ResourceAccessList';
import { WorkflowJobTemplatesAPI, OrganizationsAPI } from 'api';
import ContentLoading from 'components/ContentLoading';
import WorkflowJobTemplateDetail from './WorkflowJobTemplateDetail';
import WorkflowJobTemplateEdit from './WorkflowJobTemplateEdit';
import TemplateSurvey from './TemplateSurvey';
import { Visualizer } from './WorkflowJobTemplateVisualizer';

function WorkflowJobTemplate({ setBreadcrumb }) {
  const { t } = useLingui();
  const location = useLocation();
  const { id: templateId } = useParams();
  const baseUrl = `/templates/workflow_job_template/${templateId}`;
  const { me = {} } = useConfig();

  const {
    result: { isNotifAdmin, template, surveyConfig, launchConfig },
    isLoading: hasRolesandTemplateLoading,
    error: rolesAndTemplateError,
    request: loadTemplateAndRoles,
  } = useRequest(
    useCallback(async () => {
      const [{ data }, actions, notifAdminRes, { data: launchConfiguration }] =
        await Promise.all([
          WorkflowJobTemplatesAPI.readDetail(templateId),
          WorkflowJobTemplatesAPI.readWorkflowJobTemplateOptions(templateId),
          OrganizationsAPI.read({
            page_size: 1,
            role_level: 'notification_admin_role',
          }),
          WorkflowJobTemplatesAPI.readLaunch(templateId),
        ]);

      let surveyConfiguration = null;

      if (data.survey_enabled) {
        const { data: survey } =
          await WorkflowJobTemplatesAPI.readSurvey(templateId);

        surveyConfiguration = survey;
      }

      if (actions.data.actions.PUT) {
        if (data.webhook_service && data?.related?.webhook_key) {
          const {
            data: { webhook_key },
          } = await WorkflowJobTemplatesAPI.readWebhookKey(templateId);

          data.webhook_key = webhook_key;
        }
      }
      setBreadcrumb(data);

      return {
        template: data,
        isNotifAdmin: notifAdminRes.data.results.length > 0,
        launchConfig: launchConfiguration,
        surveyConfig: surveyConfiguration,
      };
    }, [setBreadcrumb, templateId]),
    { isNotifAdmin: false, template: null }
  );
  useEffect(() => {
    loadTemplateAndRoles();
  }, [loadTemplateAndRoles, location.pathname]);

  const loadScheduleOptions = useCallback(
    () => WorkflowJobTemplatesAPI.readScheduleOptions(templateId),
    [templateId]
  );

  const loadSchedules = useCallback(
    (params) => WorkflowJobTemplatesAPI.readSchedules(templateId, params),
    [templateId]
  );

  const canSeeNotificationsTab = me.is_system_auditor || isNotifAdmin;
  const canAddAndEditSurvey =
    template?.summary_fields?.user_capabilities.edit ||
    template?.summary_fields?.user_capabilities.delete;

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Templates`}
        </>
      ),
      link: `/templates`,
      persistentFilterKey: 'templates',
      id: 99,
    },
    { name: t`Details`, link: `${baseUrl}/details` },
    { name: t`Access`, link: `${baseUrl}/access` },
  ];

  if (canSeeNotificationsTab) {
    tabsArray.push({
      name: t`Notifications`,
      link: `${baseUrl}/notifications`,
    });
  }

  if (template) {
    tabsArray.push({
      name: t`Schedules`,
      link: `${baseUrl}/schedules`,
    });
  }

  tabsArray.push(
    {
      name: t`Visualizer`,
      link: `${baseUrl}/visualizer`,
    },
    {
      name: t`Jobs`,
      link: `${baseUrl}/jobs`,
    },
    {
      name: canAddAndEditSurvey
        ? t`Survey`
        : t`View Survey`,
      link: `${baseUrl}/survey`,
    }
  );

  tabsArray.forEach((tab, n) => {
    tab.id = n;
  });

  let showCardHeader = true;

  if (
    location.pathname.endsWith('edit') ||
    location.pathname.includes('schedules/')
  ) {
    showCardHeader = false;
  }

  const contentError = rolesAndTemplateError;

  if (hasRolesandTemplateLoading) {
    return <ContentLoading />;
  }
  if (!hasRolesandTemplateLoading && contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {contentError.response.status === 404 && (
              <span>
                {t`Template not found.`}{' '}
                <Link to="/templates">{t`View all Templates.`}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Routes>
          {template && (
            <Route
              path="details"
              element={<WorkflowJobTemplateDetail template={template} />}
            />
          )}
          {template && (
            <Route
              path="edit"
              element={<WorkflowJobTemplateEdit template={template} />}
            />
          )}
          {template && (
            <Route
              path="access"
              element={
                <ResourceAccessList
                  resource={template}
                  apiModel={WorkflowJobTemplatesAPI}
                />
              }
            />
          )}
          {template && (
            <Route
              path="schedules/*"
              element={
                <Schedules
                  apiModel={WorkflowJobTemplatesAPI}
                  setBreadcrumb={setBreadcrumb}
                  resource={template}
                  loadSchedules={loadSchedules}
                  loadScheduleOptions={loadScheduleOptions}
                  surveyConfig={surveyConfig}
                  launchConfig={launchConfig}
                />
              }
            />
          )}
          {canSeeNotificationsTab && (
            <Route
              path="notifications"
              element={
                <NotificationList
                  id={Number(templateId)}
                  canToggleNotifications={isNotifAdmin}
                  apiModel={WorkflowJobTemplatesAPI}
                  showApprovalsToggle
                />
              }
            />
          )}
          {template && (
            <Route
              path="visualizer"
              element={
                <AppendBody>
                  <FullPage>
                    <Visualizer template={template} />
                  </FullPage>
                </AppendBody>
              }
            />
          )}
          {template?.id && (
            <Route
              path="jobs"
              element={
                <JobList
                  defaultParams={{
                    workflow_job__workflow_job_template: template.id,
                  }}
                />
              }
            />
          )}
          {template && (
            <Route
              path="survey/*"
              element={
                <TemplateSurvey
                  template={template}
                  canEdit={canAddAndEditSurvey}
                />
              }
            />
          )}
          {template && (
            <Route index element={<Navigate to="details" replace />} />
          )}
          {!hasRolesandTemplateLoading && (
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  {templateId && (
                    <Link to={`${baseUrl}/details`}>
                      {t`View Template Details`}
                    </Link>
                  )}
                </ContentError>
              }
            />
          )}
        </Routes>
      </Card>
    </PageSection>
  );
}

export { WorkflowJobTemplate as _WorkflowJobTemplate };
export default WorkflowJobTemplate;
