import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Button, PageSection, Switch, Title } from '@patternfly/react-core';

import {
  SearchMinusIcon,
  SearchPlusIcon,
  ExpandArrowsAltIcon,
  ExpandIcon,
  RedoAltIcon,
} from '@patternfly/react-icons';

import Tooltip from 'components/Tooltip';
import type { Zoom } from './utils/useZoom';

export interface HeaderProps {
  title: React.ReactNode;
  handleSwitchToggle: (isChecked: boolean) => void;
  toggleState: boolean;
  zoomIn: Zoom['zoomIn'];
  zoomOut: Zoom['zoomOut'];
  resetZoom: Zoom['resetZoom'];
  zoomFit: Zoom['zoomFit'];
  refresh?: () => void;
  showZoomControls: boolean;
  /**
   * Whether Refresh is held back. By default it goes with the zoom controls,
   * which wait for a drawn graph; a failed read has no graph but still wants
   * a way to try again.
   */
  isRefreshDisabled?: boolean;
  [key: string]: unknown;
}

const Header = ({
  title,
  handleSwitchToggle,
  toggleState,
  zoomIn,
  zoomOut,
  resetZoom,
  zoomFit,
  refresh,
  showZoomControls,
  isRefreshDisabled = !showZoomControls,
}: HeaderProps) => {
  const { t } = useLingui();
  return (
    <PageSection hasBodyWrapper={false}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            minHeight: '31px',
          }}
        >
          <Title size="2xl" headingLevel="h2" data-cy="screen-title">
            {title}
          </Title>
        </div>
        <div>
          <Tooltip content={t`Refresh`} position="top">
            <Button
              ouiaId="refresh-button"
              aria-label={t`Refresh`}
              variant="plain"
              icon={<RedoAltIcon />}
              onClick={refresh}
              isDisabled={isRefreshDisabled}
            />
          </Tooltip>
          <Tooltip content={t`Zoom In`} position="top">
            <Button
              ouiaId="zoom-in-button"
              aria-label={t`Zoom In`}
              variant="plain"
              icon={<SearchPlusIcon />}
              onClick={zoomIn}
              isDisabled={!showZoomControls}
            />
          </Tooltip>
          <Tooltip content={t`Zoom Out`} position="top">
            <Button
              ouiaId="zoom-out-button"
              aria-label={t`Zoom Out`}
              variant="plain"
              icon={<SearchMinusIcon />}
              onClick={zoomOut}
              isDisabled={!showZoomControls}
            />
          </Tooltip>
          <Tooltip content={t`Fit to Screen`} position="top">
            <Button
              ouiaId="fit-to-screen-button"
              aria-label={t`Fit to Screen`}
              variant="plain"
              icon={<ExpandArrowsAltIcon />}
              onClick={zoomFit}
              isDisabled={!showZoomControls}
            />
          </Tooltip>
          <Tooltip content={t`Reset Zoom`} position="top">
            <Button
              ouiaId="reset-zoom-button"
              aria-label={t`Reset Zoom`}
              variant="plain"
              icon={<ExpandIcon />}
              onClick={resetZoom}
              isDisabled={!showZoomControls}
            />
          </Tooltip>
          <Tooltip content={t`Toggle Legend`} position="top">
            <Switch
              id="legend-toggle-switch"
              label={t`Legend`}
              isChecked={toggleState}
              onChange={() => handleSwitchToggle(!toggleState)}
            />
          </Tooltip>
        </div>
      </div>
    </PageSection>
  );
};

export default Header;
