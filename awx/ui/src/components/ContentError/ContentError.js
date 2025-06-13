/* eslint-disable react/jsx-no-useless-fragment */
import React from 'react';
import { Link, Redirect } from 'react-router-dom';
import { bool, instanceOf } from 'prop-types';
import { msg } from "@lingui/macro";
import { useLingui } from "@lingui/react";

import {
  Title,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { useSession } from 'contexts/Session';
import ErrorDetail from '../ErrorDetail';

function ContentError({ error, children, isNotFound }) {
  const { i18n } = useLingui();
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
        <Redirect to="/login" />
      ) : (
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title size="lg" headingLevel="h3">
            {is404 ? i18n._(msg`Not Found`) : i18n._(msg`Something went wrong...`)}
          </Title>
          <EmptyStateBody>
            {is404
              ? i18n._(msg`The page you requested could not be found.`)
              : i18n._(msg`There was an error loading this content. Please reload the page.`)}{' '}
            {children || <Link to="/home">{i18n._(msg`Back to Dashboard.`)}</Link>}
          </EmptyStateBody>
          {error && <ErrorDetail error={error} />}
        </EmptyState>
      )}
    </>
  );
}
ContentError.propTypes = {
  error: instanceOf(Error),
  isNotFound: bool,
};
ContentError.defaultProps = {
  error: null,
  isNotFound: false,
};

export { ContentError as _ContentError };
export default ContentError;
