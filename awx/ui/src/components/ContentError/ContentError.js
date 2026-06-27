
import React from 'react';
import { Link } from 'react-router';
import { Navigate } from 'routerCompat';
import { useLingui } from '@lingui/react/macro';

import {
  EmptyState,
  EmptyStateBody, EmptyStateFooter,
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
        <EmptyState  headingLevel="h3" icon={ExclamationTriangleIcon}  titleText={<>{is404
              ? t`Not Found`
              : t`Something went wrong...`}</>} variant="full">
          <EmptyStateBody>
            {is404
              ? t`The page you requested could not be found.`
              : t`There was an error loading this content. Please reload the page.`}{' '}
            {children || (
              <Link to="/home">{t`Back to Dashboard.`}</Link>
            )}
          </EmptyStateBody><EmptyStateFooter>
          {error && <ErrorDetail error={error} />}
        </EmptyStateFooter></EmptyState>
      )}
    </>
  );
}
export { ContentError as _ContentError };
export default ContentError;
