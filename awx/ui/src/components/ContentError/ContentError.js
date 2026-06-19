
import React from 'react';
import { Link } from 'react-router-dom';
import { Navigate } from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';

import {
  Title,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { useSession } from 'contexts/Session';
import ErrorDetail from '../ErrorDetail';

function ContentError({ error = null, children, isNotFound = false }) {
  const { t } = useLingui();
  const { logout } = useSession();

  if (error && error.response && error.response.status === 401) {
    if (!error.response.headers['session-timeout']) {
      logout();
      return null;
    }
  }
  const is404 =
    isNotFound || (error && error.response && error.response.status === 404);
  const is401 = error && error.response && error.response.status === 401;
  return (
    <>
      {is401 ? (
        <Navigate to="/login" />
      ) : (
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title size="lg" headingLevel="h3">
            {is404
              ? t`Not Found`
              : t`Something went wrong...`}
          </Title>
          <EmptyStateBody>
            {is404
              ? t`The page you requested could not be found.`
              : t`There was an error loading this content. Please reload the page.`}{' '}
            {children || (
              <Link to="/home">{t`Back to Dashboard.`}</Link>
            )}
          </EmptyStateBody>
          {error && <ErrorDetail error={error} />}
        </EmptyState>
      )}
    </>
  );
}
export { ContentError as _ContentError };
export default ContentError;
