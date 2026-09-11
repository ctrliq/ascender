import type { DetailedError } from 'types/api';
import React from 'react';
import { Link, Navigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import {
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { useSession } from 'contexts/Session';
import ErrorDetail from '../ErrorDetail';

export interface ContentErrorProps {
  error?: unknown;
  children?: React.ReactNode;
  isNotFound?: boolean;
  [key: string]: unknown;
}

function ContentError({
  error,
  children,
  isNotFound = false,
}: ContentErrorProps) {
  const { t } = useLingui();
  const { logout } = useSession();

  // Callers pass whatever they caught, so the shape is asserted once here
  // rather than at each of them.
  const response = (error as DetailedError | null)?.response;

  if (response && response.status === 401) {
    if (!response.headers['session-timeout']) {
      logout();
      return null;
    }
  }
  const is404 = isNotFound || response?.status === 404;
  const is401 = response?.status === 401;
  return (
    <>
      {is401 ? (
        <Navigate to="/login" />
      ) : (
        <EmptyState
          headingLevel="h3"
          icon={ExclamationTriangleIcon}
          titleText={<>{is404 ? t`Not Found` : t`Something went wrong...`}</>}
          variant="full"
        >
          <EmptyStateBody>
            {is404
              ? t`The page you requested could not be found.`
              : t`There was an error loading this content. Please reload the page.`}{' '}
            {children || <Link to="/home">{t`Back to Dashboard.`}</Link>}
          </EmptyStateBody>
          <EmptyStateFooter>
            {error && <ErrorDetail error={error} />}
          </EmptyStateFooter>
        </EmptyState>
      )}
    </>
  );
}
export { ContentError as _ContentError };
export default ContentError;
