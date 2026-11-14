import type { BreadcrumbResource } from 'types/api';
import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import ProjectsList from './ProjectList/ProjectList';
import ProjectAdd from './ProjectAdd/ProjectAdd';
import Project from './Project';

function Projects() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/projects': t`Projects`,
    '/projects/add': t`Create New Project`,
  });

  const buildBreadcrumbConfig = useCallback(
    (project?: BreadcrumbResource, nested?: BreadcrumbResource) => {
      if (!project) {
        return;
      }
      const projectSchedulesPath = `/projects/${project.id}/schedules`;
      setBreadcrumbConfig({
        '/projects': t`Projects`,
        '/projects/add': t`Create New Project`,
        [`/projects/${project.id}`]: `${project.name}`,
        [`/projects/${project.id}/edit`]: t`Edit ${project.name}`,
        [`/projects/${project.id}/details`]: `${project.name}`,
        [`/projects/${project.id}/access`]: `${project.name}`,
        [`/projects/${project.id}/notifications`]: `${project.name}`,
        [`/projects/${project.id}/job_templates`]: `${project.name}`,
        [`/projects/${project.id}/runs`]: `${project.name}`,
        [`${projectSchedulesPath}`]: `${project.name}`,
        [`${projectSchedulesPath}/add`]: t`Create New Schedule`,
        [`${projectSchedulesPath}/${nested?.id}`]: `${nested?.name}`,
        [`${projectSchedulesPath}/${nested?.id}/details`]: `${nested?.name}`,
        [`${projectSchedulesPath}/${nested?.id}/edit`]: t`Edit ${nested?.name}`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader streamType="project" breadcrumbConfig={breadcrumbConfig} />
      <Routes>
        <Route path="add" element={<ProjectAdd />} />
        {/* so the nested <Project> route tree can match */}
        <Route
          path=":id/*"
          element={<Project setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="projects">
              <ProjectsList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export { Projects as _Projects };
export default Projects;
