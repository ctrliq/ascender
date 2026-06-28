import React from 'react';
import { Link, Routes, Route, Navigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import SAMLDetail from './SAMLDetail';
import SAMLEdit from './SAMLEdit';

function SAML() {
  const { t } = useLingui();
  const baseURL = '/settings/saml';
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <Routes>
          <Route
            index
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path="details" element={<SAMLDetail />} />
          <Route path="edit" element={<SAMLEdit />} />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>
                  {t`View SAML settings`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default SAML;
