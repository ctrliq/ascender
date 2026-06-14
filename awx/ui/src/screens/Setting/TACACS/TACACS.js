import React from 'react';
import { Link } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import TACACSDetail from './TACACSDetail';
import TACACSEdit from './TACACSEdit';

function TACACS() {
  const { t } = useLingui();
  const baseURL = '/settings/tacacs';
  return (
    <PageSection>
      <Card>
        <Routes>
          <Route
            path={baseURL}
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path={`${baseURL}/details`} element={<TACACSDetail />} />
          <Route path={`${baseURL}/edit`} element={<TACACSEdit />} />
          <Route
            path={`${baseURL}/*`}
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>
                  {t`View TACACS+ settings`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default TACACS;
