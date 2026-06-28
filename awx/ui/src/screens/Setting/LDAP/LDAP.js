import React from 'react';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import LDAPDetail from './LDAPDetail';
import LDAPEdit from './LDAPEdit';

// /settings/ldap/:category (no sub-view) redirects to that category's details
function CategoryRedirect({ baseURL }) {
  const { category } = useParams();
  return <Navigate to={`${baseURL}/${category}/details`} replace />;
}

function LDAP() {
  const { t } = useLingui();
  const baseURL = '/settings/ldap';

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
            element={<LDAPDetail />}
          />
          <Route path=":category/edit" element={<LDAPEdit />} />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/default/details`}>
                  {t`View LDAP Settings`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default LDAP;
