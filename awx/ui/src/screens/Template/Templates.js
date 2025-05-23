import React, { useState, useCallback, useRef } from 'react';

import { msg } from '@lingui/macro';
import { Route, withRouter, Switch } from 'react-router-dom';
import { PageSection } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import TemplateList from 'components/TemplateList';
import PersistentFilters from 'components/PersistentFilters';
import Template from './Template';
import WorkflowJobTemplate from './WorkflowJobTemplate';
import JobTemplateAdd from './JobTemplateAdd';
import WorkflowJobTemplateAdd from './WorkflowJobTemplateAdd';

function Templates() {
  const { i18n } = useLingui();
  const initScreenHeader = useRef({
    '/templates': i18n._(msg`Templates`),
    '/templates/job_template/add': i18n._(msg`Create New Job Template`),
    '/templates/workflow_job_template/add': i18n._(msg`Create New Workflow Template`),
  });
  const [breadcrumbConfig, setScreenHeader] = useState(
    initScreenHeader.current
  );

  const [schedule, setSchedule] = useState();
  const [template, setTemplate] = useState();

  const setBreadcrumbConfig = useCallback(
    (passedTemplate, passedSchedule) => {
      if (passedTemplate && passedTemplate.name !== template?.name) {
        setTemplate(passedTemplate);
      }
      if (passedSchedule && passedSchedule.name !== schedule?.name) {
        setSchedule(passedSchedule);
      }
      if (!template) return;
      const templatePath = `/templates/${template.type}/${template.id}`;
      const schedulesPath = `${templatePath}/schedules`;
      const surveyPath = `${templatePath}/survey`;
      setScreenHeader({
        ...initScreenHeader.current,
        [templatePath]: `${template.name}`,
        [`${templatePath}/details`]: i18n._(msg`Details`),
        [`${templatePath}/edit`]: i18n._(msg`Edit Details`),
        [`${templatePath}/access`]: i18n._(msg`Access`),
        [`${templatePath}/notifications`]: i18n._(msg`Notifications`),
        [`${templatePath}/jobs`]: i18n._(msg`Jobs`),
        [surveyPath]: i18n._(msg`Survey`),
        [`${surveyPath}/add`]: i18n._(msg`Add Question`),
        [`${surveyPath}/edit`]: i18n._(msg`Edit Question`),
        [schedulesPath]: i18n._(msg`Schedules`),
        [`${schedulesPath}/add`]: i18n._(msg`Create New Schedule`),
        [`${schedulesPath}/${schedule?.id}`]: `${schedule?.name}`,
        [`${schedulesPath}/${schedule?.id}/details`]: i18n._(msg`Schedule Details`),
        [`${schedulesPath}/${schedule?.id}/edit`]: i18n._(msg`Edit Schedule`),
      });
    },
    [template, schedule, i18n]
  );

  return (
    <>
      <ScreenHeader
        streamType="job_template,workflow_job_template,workflow_job_template_node"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path="/templates/job_template/add">
          <JobTemplateAdd />
        </Route>
        <Route path="/templates/workflow_job_template/add">
          <WorkflowJobTemplateAdd />
        </Route>
        <Route path="/templates/job_template/:id">
          <Template setBreadcrumb={setBreadcrumbConfig} />
        </Route>
        <Route path="/templates/workflow_job_template/:id">
          <WorkflowJobTemplate setBreadcrumb={setBreadcrumbConfig} />
        </Route>
        <Route path="/templates">
          <PageSection>
            <PersistentFilters pageKey="templates">
              <TemplateList />
            </PersistentFilters>
          </PageSection>
        </Route>
      </Switch>
    </>
  );
}

export { Templates as _Templates };
export default withRouter(Templates);
