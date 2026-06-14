import React from 'react';
import { Link } from 'react-router-dom';
import {
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import GitHubDetail from './GitHubDetail';
import GitHubEdit from './GitHubEdit';
import GitHubOrgEdit from './GitHubOrgEdit';
import GitHubTeamEdit from './GitHubTeamEdit';
import GitHubEnterpriseEdit from './GitHubEnterpriseEdit';
import GitHubEnterpriseOrgEdit from './GitHubEnterpriseOrgEdit';
import GitHubEnterpriseTeamEdit from './GitHubEnterpriseTeamEdit';

// /settings/github/:category (no sub-view) redirects to that category's details
function CategoryRedirect({ baseURL }) {
  const { category } = useParams();
  return <Navigate to={`${baseURL}/${category}/details`} replace />;
}

function GitHub() {
  const { t } = useLingui();
  const baseURL = '/settings/github';

  return (
    <PageSection>
      <Card>
        <Routes>
          <Route
            path={baseURL}
            element={<Navigate to={`${baseURL}/default/details`} replace />}
          />
          <Route
            path={`${baseURL}/:category`}
            element={<CategoryRedirect baseURL={baseURL} />}
          />
          <Route
            path={`${baseURL}/:category/details`}
            element={<GitHubDetail />}
          />
          <Route path={`${baseURL}/default/edit`} element={<GitHubEdit />} />
          <Route
            path={`${baseURL}/organization/edit`}
            element={<GitHubOrgEdit />}
          />
          <Route path={`${baseURL}/team/edit`} element={<GitHubTeamEdit />} />
          <Route
            path={`${baseURL}/enterprise/edit`}
            element={<GitHubEnterpriseEdit />}
          />
          <Route
            path={`${baseURL}/enterprise_organization/edit`}
            element={<GitHubEnterpriseOrgEdit />}
          />
          <Route
            path={`${baseURL}/enterprise_team/edit`}
            element={<GitHubEnterpriseTeamEdit />}
          />
          <Route
            path={`${baseURL}/*`}
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/default/details`}>
                  {t`View GitHub Settings`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default GitHub;
