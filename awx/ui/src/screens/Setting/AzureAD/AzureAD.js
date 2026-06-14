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
            element={<AzureADDetail />}
          />
          <Route path={`${baseURL}/default/edit`} element={<AzureADEdit />} />
          <Route
            path={`${baseURL}/tenant/edit`}
            element={<AzureADTenantEdit />}
          />
          <Route
            path={`${baseURL}/*`}
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
