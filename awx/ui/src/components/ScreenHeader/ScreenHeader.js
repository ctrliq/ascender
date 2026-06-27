import React from 'react';
import useTitle from 'hooks/useTitle';

import { useLingui } from '@lingui/react/macro';
import {
  Button,
  PageSection,
  Breadcrumb,
  BreadcrumbItem,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { HistoryIcon } from '@patternfly/react-icons';
import { Link, useLocation } from 'react-router';

const ScreenHeader = ({ breadcrumbConfig, streamType }) => {
  const { t } = useLingui();
  const location = useLocation();

  // Document <title>: look up the parent path's label (drop the leaf segment for
  // any path deeper than one level), preserving the original behaviour.
  const parts = location.pathname.split('/');
  if (parts.length > 2) {
    parts.pop();
  }
  const pathTitle = breadcrumbConfig[parts.join('/')];
  useTitle(pathTitle);

  // Build the cumulative resolved paths along the current location, e.g.
  // /foo/1/bar -> ['/foo', '/foo/1', '/foo/1/bar']. breadcrumbConfig is keyed by
  // these literal resolved paths, so a string lookup replaces the v5 recursive
  // <Route>/useRouteMatch walk.
  const segments = location.pathname.split('/').filter(Boolean);
  const cumulativePaths = segments.map(
    (_, index) => `/${segments.slice(0, index + 1).join('/')}`
  );
  const currentPath =
    cumulativePaths[cumulativePaths.length - 1] || location.pathname;

  // When the location is exactly the screen's root crumb, show only the title.
  const isOnlyOneCrumb = currentPath === Object.keys(breadcrumbConfig)[0];

  // Breadcrumb links: every ancestor path that has a configured label, except
  // the current page (rendered as the title below).
  const crumbs = cumulativePaths.filter(
    (path) => path !== currentPath && breadcrumbConfig[path]
  );
  const title = breadcrumbConfig[currentPath];

  return (
    <PageSection hasBodyWrapper={false}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          {!isOnlyOneCrumb && (
            <Breadcrumb ouiaId="breadcrumb-list">
              {crumbs.map((path, index) => (
                <BreadcrumbItem
                  key={path}
                  showDivider={index > 0}
                  data-cy={breadcrumbConfig[path]}
                >
                  <Link to={path}>{breadcrumbConfig[path]}</Link>
                </BreadcrumbItem>
              ))}
            </Breadcrumb>
          )}
          <div
            style={{
              minHeight: '31px',
            }}
          >
            {title && (
              <Title size="2xl" headingLevel="h2" data-cy="screen-title">
                {title}
              </Title>
            )}
          </div>
        </div>
        {streamType !== 'none' && (
          <div>
            <Tooltip content={t`View activity stream`} position="top">
              <Button icon={<HistoryIcon />}
                ouiaId="activity-stream-button"
                aria-label={t`View activity stream`}
                variant="plain"
                component={Link}
                to={`/activity_stream${
                  streamType ? `?type=${streamType}` : ''
                }`}
               />
            </Tooltip>
          </div>
        )}
      </div>
    </PageSection>
  );
};

export default ScreenHeader;
