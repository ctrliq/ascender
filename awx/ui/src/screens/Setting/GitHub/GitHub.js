import React from 'react';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams } from 'react-router';
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
    <PageSection hasBodyWrapper={false}>
      <Card>
        <Routes>
          <Route
            index
            element={<Navigate to={`${baseURL}/default/details`} replace />}
          />
          <Route
            path=":category"
            element={<CategoryRedirect baseURL={baseURL} />}
          />
          <Route
            path=":category/details"
            element={<GitHubDetail />}
          />
          <Route path="default/edit" element={<GitHubEdit />} />
          <Route
            path="organization/edit"
            element={<GitHubOrgEdit />}
          />
          <Route path="team/edit" element={<GitHubTeamEdit />} />
          <Route
            path="enterprise/edit"
            element={<GitHubEnterpriseEdit />}
          />
          <Route
            path="enterprise_organization/edit"
            element={<GitHubEnterpriseOrgEdit />}
          />
          <Route
            path="enterprise_team/edit"
            element={<GitHubEnterpriseTeamEdit />}
          />
          <Route
            path="*"
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
