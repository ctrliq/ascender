import React from 'react';
import useTitle from 'hooks/useTitle';

import { useLingui } from '@lingui/react/macro';
import {
  Button,
  PageSection,
  Breadcrumb,
  BreadcrumbItem,
  Title,
} from '@patternfly/react-core';
import { HistoryIcon } from '@patternfly/react-icons';
import { Link, useLocation } from 'react-router';
import Tooltip from '../Tooltip';

export interface ScreenHeaderProps {
  /**
   * Each path in the trail, and the label the crumb shows for it. Strings
   * rather than nodes, because the page title is taken from one of them.
   */
  breadcrumbConfig: Record<string, string | null>;
  streamType?: React.ReactNode;
}

const ScreenHeader = ({ breadcrumbConfig, streamType }: ScreenHeaderProps) => {
  const { t } = useLingui();
  const location = useLocation();

  // Document <title>: look up the parent path's label (drop the leaf segment for
  // any path deeper than one level), preserving the original behaviour.
  const parts = location.pathname.split('/');
  if (parts.length > 2) {
    parts.pop();
  }
  // Null where a path is a grouping rather than a page of its own, which is
  // the same as having no title for it: the page's own name then, for a screen
  // whose tabs are addresses under a root that names nothing.
  const pathTitle =
    breadcrumbConfig[parts.join('/')] ??
    breadcrumbConfig[location.pathname] ??
    undefined;
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

  /*
   * What the page is called. Its own label where it has one; otherwise the
   * nearest thing above it that has one, which is the screen: a tab whose
   * address the screen did not name, and an address that resolved to nothing,
   * both then read as the screen they are inside rather than as a blank line.
   */
  const title =
    breadcrumbConfig[currentPath] ??
    [...cumulativePaths]
      .reverse()
      .map((path) => breadcrumbConfig[path])
      .find(Boolean);
  // Breadcrumb links: every ancestor path that has a configured label, except
  // the current page (rendered as the title below) and any ancestor that says
  // what the title says. A view of a thing is titled for the thing, so the
  // thing's own address would otherwise stand in the trail repeating it.
  const crumbs = cumulativePaths
    .filter(
      (path) =>
        path !== currentPath &&
        breadcrumbConfig[path] &&
        breadcrumbConfig[path] !== title
    )
    // A thing and its views are labelled alike, so a page below one of those
    // views would name the thing twice in a row. Once is the trail.
    .filter(
      (path, index, kept) =>
        index === 0 ||
        breadcrumbConfig[path] !== breadcrumbConfig[kept[index - 1] as string]
    );

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
          {/* Only where there is a trail to show. A page whose ancestors carry
              no label of their own, which is every settings page now that each
              is named in the rail, used to render the bar empty: twenty pixels
              of nothing that stood its title lower than every other screen's. */}
          {!isOnlyOneCrumb && crumbs.length > 0 && (
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
        {streamType === 'none' ? (
          /* A screen the activity stream does not record still stands its
             header as tall as every other one: without the button, which is
             the tallest thing in the row, a list page's title bar came out
             seven pixels shorter than its neighbours and the content jumped
             on the way between them. An invisible copy keeps the height
             tracking the button's own sizing rather than a number; its icon
             takes the size every theme gives the real one, which the themes
             set by the real button's OUIA id and so cannot reach here. */
          <div
            aria-hidden="true"
            data-cy="activity-stream-spacer"
            style={{ visibility: 'hidden' }}
          >
            <Button
              icon={<HistoryIcon style={{ fontSize: '1.25rem' }} />}
              variant="plain"
              component="a"
              tabIndex={-1}
            />
          </div>
        ) : (
          <div>
            <Tooltip content={t`View Activity Stream`} position="top">
              <Button
                icon={<HistoryIcon />}
                ouiaId="activity-stream-button"
                aria-label={t`View Activity Stream`}
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
