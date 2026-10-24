import type { BreadcrumbResource, Schedule } from 'types/api';
import React, { useState, useCallback, useRef } from 'react';

import { Routes, Route } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import TemplateList from 'components/TemplateList';
import PersistentFilters from 'components/PersistentFilters';
import Template from './Template';
import WorkflowJobTemplate from './WorkflowJobTemplate';
import JobTemplateAdd from './JobTemplateAdd';
import WorkflowJobTemplateAdd from './WorkflowJobTemplateAdd';

function Templates() {
  const { t } = useLingui();
  const initScreenHeader = useRef({
    '/templates': t`Templates`,
    '/templates/job_template/add': t`Create New Job Template`,
    '/templates/workflow_job_template/add': t`Create New Workflow Template`,
  });
  const [breadcrumbConfig, setScreenHeader] = useState(
    initScreenHeader.current
  );

  const [schedule, setSchedule] = useState<Schedule | undefined>();
  const [template, setTemplate] = useState<BreadcrumbResource>();

  const setBreadcrumbConfig = useCallback(
    (
      passedTemplate?: BreadcrumbResource,
      passedSchedule?: BreadcrumbResource
    ) => {
      if (passedTemplate && passedTemplate.name !== template?.name) {
        setTemplate(passedTemplate);
      }
      if (passedSchedule && passedSchedule.name !== schedule?.name) {
        setSchedule(passedSchedule as Schedule);
      }
      if (!template) return;
      const templatePath = `/templates/${template.type}/${template.id}`;
      const schedulesPath = `${templatePath}/schedules`;
      const surveyPath = `${templatePath}/survey`;
      setScreenHeader({
        ...initScreenHeader.current,
        [templatePath]: `${template.name}`,
        [`${templatePath}/details`]: `${template.name}`,
        [`${templatePath}/edit`]: t`Edit ${template.name}`,
        [`${templatePath}/access`]: `${template.name}`,
        [`${templatePath}/notifications`]: `${template.name}`,
        [`${templatePath}/runs`]: `${template.name}`,
        [surveyPath]: `${template.name}`,
        [`${surveyPath}/add`]: t`Add Question`,
        [`${surveyPath}/edit`]: t`Edit Question`,
        [schedulesPath]: `${template.name}`,
        [`${schedulesPath}/add`]: t`Create New Schedule`,
        [`${schedulesPath}/${schedule?.id}`]: `${schedule?.name}`,
        [`${schedulesPath}/${schedule?.id}/details`]: `${schedule?.name}`,
        [`${schedulesPath}/${schedule?.id}/edit`]: t`Edit ${schedule?.name}`,
      });
    },
    [template, schedule, t]
  );

  return (
    <>
      <ScreenHeader
        streamType="job_template,workflow_job_template,workflow_job_template_node"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route path="job_template/add" element={<JobTemplateAdd />} />
        <Route
          path="workflow_job_template/add"
          element={<WorkflowJobTemplateAdd />}
        />
        <Route
          path="job_template/:id/*"
          element={<Template setBreadcrumb={setBreadcrumbConfig} />}
        />
        <Route
          path="workflow_job_template/:id/*"
          element={<WorkflowJobTemplate setBreadcrumb={setBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PageSection hasBodyWrapper={false}>
              {/* The card is the page's rather than the list's, so the
                  dashboard's tab can hold the same list without a second one. */}
              <Card>
                <PersistentFilters pageKey="templates">
                  <TemplateList hasTypeTabs />
                </PersistentFilters>
              </Card>
            </PageSection>
          }
        />
      </Routes>
    </>
  );
}

export { Templates as _Templates };
export default Templates;
