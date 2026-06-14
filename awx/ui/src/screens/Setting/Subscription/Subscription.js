import React from 'react';
import { Link } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import SubscriptionDetail from './SubscriptionDetail';
import SubscriptionEdit from './SubscriptionEdit';

function Subscription() {
  const { t } = useLingui();
  const baseURL = '/settings/subscription';

  return (
    <PageSection>
      <Card>
        <Routes>
          <Route
            path={baseURL}
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route
            path={`${baseURL}/details`}
            element={<SubscriptionDetail />}
          />
          <Route path={`${baseURL}/edit`} element={<SubscriptionEdit />} />
          <Route
            path={`${baseURL}/*`}
            element={
              <ContentError isNotFound>
                <Link to={baseURL}>{t`View Settings`}</Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default Subscription;
