import React from 'react';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import AzureADDetail from './AzureADDetail';
import AzureADEdit from './AzureADEdit';
import AzureADTenantEdit from './AzureADTenantEdit';

// /settings/azure/:category (no sub-view) redirects to that category's details
function CategoryRedirect({ baseURL }) {
  const { category } = useParams();
  return <Navigate to={`${baseURL}/${category}/details`} replace />;
}

function AzureAD() {
  const { t } = useLingui();
  const baseURL = '/settings/azure';

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
            element={<AzureADDetail />}
          />
          <Route path="default/edit" element={<AzureADEdit />} />
          <Route
            path="tenant/edit"
            element={<AzureADTenantEdit />}
          />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/default/details`}>
                  {t`View Azure AD settings`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default AzureAD;
