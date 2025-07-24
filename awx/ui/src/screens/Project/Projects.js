import React, { useState, useCallback } from 'react';
import { Route, withRouter, Switch } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import ProjectsList from './ProjectList/ProjectList';
import ProjectAdd from './ProjectAdd/ProjectAdd';
import Project from './Project';

function Projects() {
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/projects': i18n._(msg`Projects`),
    '/projects/add': i18n._(msg`Create New Project`),
  });

  const buildBreadcrumbConfig = useCallback(
    (project, nested) => {
      if (!project) {
        return;
      }
      const projectSchedulesPath = `/projects/${project.id}/schedules`;
      setBreadcrumbConfig({
        '/projects': i18n._(msg`Projects`),
        '/projects/add': i18n._(msg`Create New Project`),
        [`/projects/${project.id}`]: `${project.name}`,
        [`/projects/${project.id}/edit`]: i18n._(msg`Edit Details`),
        [`/projects/${project.id}/details`]: i18n._(msg`Details`),
        [`/projects/${project.id}/access`]: i18n._(msg`Access`),
        [`/projects/${project.id}/notifications`]: i18n._(msg`Notifications`),
        [`/projects/${project.id}/job_templates`]: i18n._(msg`Job Templates`),
        [`${projectSchedulesPath}`]: i18n._(msg`Schedules`),
        [`${projectSchedulesPath}/add`]: i18n._(msg`Create New Schedule`),
        [`${projectSchedulesPath}/${nested?.id}`]: `${nested?.name}`,
        [`${projectSchedulesPath}/${nested?.id}/details`]: i18n._(
          msg`Schedule Details`
        ),
        [`${projectSchedulesPath}/${nested?.id}/edit`]: i18n._(
          msg`Edit Details`
        ),
      });
    },
    [i18n]
  );

  return (
    <>
      <ScreenHeader streamType="project" breadcrumbConfig={breadcrumbConfig} />
      <Switch>
        <Route path="/projects/add">
          <ProjectAdd />
        </Route>
        <Route path="/projects/:id">
          <Project setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/projects">
          <PersistentFilters pageKey="projects">
            <ProjectsList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export { Projects as _Projects };
export default withRouter(Projects);
