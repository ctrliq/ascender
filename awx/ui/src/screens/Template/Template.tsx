import type { DetailedError, Untyped } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';

import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import {
  Link,
  useLocation,
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router';
import RoutedTabs from 'components/RoutedTabs';
import type { RoutedTab } from 'components/RoutedTabs';
import { useConfig } from 'contexts/Config';
import useRequest from 'hooks/useRequest';
import ContentError from 'components/ContentError';
import JobList from 'components/JobList';
import NotificationList from 'components/NotificationList';
import { Schedules } from 'components/Schedule';
import { ResourceAccessList } from 'components/ResourceAccessList';
import { JobTemplatesAPI, OrganizationsAPI } from 'api';
import JobTemplateDetail from './JobTemplateDetail';
import JobTemplateEdit from './JobTemplateEdit';
import TemplateSurvey from './TemplateSurvey';

export interface TemplateProps {
  setBreadcrumb: Untyped;
  [key: string]: unknown;
}

function Template({ setBreadcrumb }: TemplateProps) {
  const location = useLocation();
  const { id: templateId } = useParams() as { id: string };
  const baseUrl = `/templates/job_template/${templateId}`;
  const { me = {} } = useConfig();
  const { t } = useLingui();

  const {
    result: {
      isNotifAdmin,
      template,
      surveyConfig,
      launchConfig,
      resourceDefaultCredentials,
    },
    isLoading,
    error: contentError,
    request: loadTemplateAndRoles,
  } = useRequest(
    useCallback(async () => {
      const [
        { data },
        {
          data: { results: defaultCredentials },
        },
        actions,
        notifAdminRes,
        { data: launchConfiguration },
      ] = await Promise.all([
        JobTemplatesAPI.readDetail(templateId),
        JobTemplatesAPI.readCredentials(templateId, {
          page_size: 200,
        }),
        JobTemplatesAPI.readTemplateOptions(templateId),
        OrganizationsAPI.read({
          page_size: 1,
          role_level: 'notification_admin_role',
        }),
        JobTemplatesAPI.readLaunch(templateId),
      ]);
      let surveyConfiguration = {};

      if (data.survey_enabled) {
        const { data: survey } = await JobTemplatesAPI.readSurvey(templateId);

        surveyConfiguration = survey;
      }
      if (data.summary_fields.credentials) {
        data.summary_fields.credentials = defaultCredentials;
      }

      if (actions.data.actions.PUT) {
        if (data.webhook_service && data?.related?.webhook_key) {
          const {
            data: { webhook_key },
          } = await JobTemplatesAPI.readWebhookKey(templateId);

          data.webhook_key = webhook_key;
        }
      }
      return {
        template: data,
        isNotifAdmin: notifAdminRes.data.results.length > 0,
        surveyConfig: surveyConfiguration,
        launchConfig: launchConfiguration,
        resourceDefaultCredentials: defaultCredentials,
      };
    }, [templateId]),
    {
      isNotifAdmin: false,
      template: null,
      resourceDefaultCredentials: [],
      surveyConfig: {},
      launchConfig: {},
    }
  );

  useEffect(() => {
    loadTemplateAndRoles();
  }, [loadTemplateAndRoles]);

  useEffect(() => {
    if (template) {
      setBreadcrumb(template);
    }
  }, [template, setBreadcrumb]);

  const loadScheduleOptions = useCallback(
    () => JobTemplatesAPI.readScheduleOptions(templateId),
    [templateId]
  );

  const loadSchedules = useCallback(
    (params: Untyped) => JobTemplatesAPI.readSchedules(templateId, params),
    [templateId]
  );

  const canSeeNotificationsTab = me?.is_system_auditor || isNotifAdmin;
  const canAddAndEditSurvey =
    template?.summary_fields?.user_capabilities.edit ||
    template?.summary_fields?.user_capabilities.delete;

  const tabsArray: Omit<RoutedTab, 'id'>[] = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Templates`}
        </>
      ),
      link: `/templates`,
      persistentFilterKey: 'templates',
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
      name: t`Jobs`,
      link: `${baseUrl}/jobs`,
    },
    {
      name: canAddAndEditSurvey ? t`Survey` : t`View Survey`,
      link: `${baseUrl}/survey`,
    }
  );

  // Ids come from position rather than from the literals, since which tabs
  // exist depends on the template and on who is looking at it.
  const tabs: RoutedTab[] = tabsArray.map((tab, id) => ({ ...tab, id }));

  if (contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {(contentError as DetailedError).response?.status === 404 && (
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

  const showCardHeader = !(
    location.pathname.endsWith('edit') ||
    location.pathname.includes('schedules/') ||
    location.pathname.includes('survey/')
  );

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabs} />}
        {template && (
          <Routes>
            <Route
              path="details"
              element={
                <JobTemplateDetail
                  hasTemplateLoading={isLoading}
                  template={template}
                />
              }
            />
            <Route
              path="edit"
              element={
                <JobTemplateEdit
                  template={template}
                  reloadTemplate={loadTemplateAndRoles}
                />
              }
            />
            <Route
              path="access"
              element={
                <ResourceAccessList
                  resource={template}
                  apiModel={JobTemplatesAPI}
                />
              }
            />
            <Route
              path="schedules/*"
              element={
                <Schedules
                  apiModel={JobTemplatesAPI}
                  setBreadcrumb={setBreadcrumb}
                  resource={template}
                  loadSchedules={loadSchedules}
                  loadScheduleOptions={loadScheduleOptions}
                  surveyConfig={surveyConfig}
                  launchConfig={launchConfig}
                  resourceDefaultCredentials={resourceDefaultCredentials}
                />
              }
            />
            {canSeeNotificationsTab && (
              <Route
                path="notifications"
                element={
                  <NotificationList
                    id={Number(templateId)}
                    canToggleNotifications={isNotifAdmin}
                    apiModel={JobTemplatesAPI}
                    showChangedToggle
                  />
                }
              />
            )}
            <Route
              path="jobs"
              element={
                <JobList defaultParams={{ job__job_template: template.id }} />
              }
            />
            <Route
              path="survey/*"
              element={
                <TemplateSurvey
                  template={template}
                  canEdit={canAddAndEditSurvey}
                />
              }
            />
            <Route index element={<Navigate to="details" replace />} />
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
          </Routes>
        )}
      </Card>
    </PageSection>
  );
}

export { Template as _Template };
export default Template;
