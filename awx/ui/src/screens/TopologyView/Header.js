import React from 'react';
import PropTypes from 'prop-types';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  Button,
  PageSection,
  PageSectionVariants,
  Switch,
  Title,
  Tooltip,
} from '@patternfly/react-core';

import {
  SearchMinusIcon,
  SearchPlusIcon,
  ExpandArrowsAltIcon,
  ExpandIcon,
  RedoAltIcon,
} from '@patternfly/react-icons';

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
}) => {
  const { i18n } = useLingui();
  const { light } = PageSectionVariants;
  return (
    <PageSection variant={light}>
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
          <Tooltip content={i18n._(msg`Refresh`)} position="top">
            <Button
              ouiaId="refresh-button"
              aria-label={i18n._(msg`Refresh`)}
              variant="plain"
              icon={<RedoAltIcon />}
              onClick={refresh}
              isDisabled={!showZoomControls}
            >
              <RedoAltIcon />
            </Button>
          </Tooltip>
          <Tooltip content={i18n._(msg`Zoom in`)} position="top">
            <Button
              ouiaId="zoom-in-button"
              aria-label={i18n._(msg`Zoom in`)}
              variant="plain"
              icon={<SearchPlusIcon />}
              onClick={zoomIn}
              isDisabled={!showZoomControls}
            >
              <SearchPlusIcon />
            </Button>
          </Tooltip>
          <Tooltip content={i18n._(msg`Zoom out`)} position="top">
            <Button
              ouiaId="zoom-out-button"
              aria-label={i18n._(msg`Zoom out`)}
              variant="plain"
              icon={<SearchMinusIcon />}
              onClick={zoomOut}
              isDisabled={!showZoomControls}
            >
              <SearchMinusIcon />
            </Button>
          </Tooltip>
          <Tooltip content={i18n._(msg`Fit to screen`)} position="top">
            <Button
              ouiaId="fit-to-screen-button"
              aria-label={i18n._(msg`Fit to screen`)}
              variant="plain"
              icon={<ExpandArrowsAltIcon />}
              onClick={zoomFit}
              isDisabled={!showZoomControls}
            >
              <ExpandArrowsAltIcon />
            </Button>
          </Tooltip>
          <Tooltip content={i18n._(msg`Reset zoom`)} position="top">
            <Button
              ouiaId="reset-zoom-button"
              aria-label={i18n._(msg`Reset zoom`)}
              variant="plain"
              icon={<ExpandIcon />}
              onClick={resetZoom}
              isDisabled={!showZoomControls}
            >
              <ExpandIcon />
            </Button>
          </Tooltip>
          <Tooltip content={i18n._(msg`Toggle legend`)} position="top">
            <Switch
              id="legend-toggle-switch"
              label={i18n._(msg`Legend`)}
              isChecked={toggleState}
              onChange={() => handleSwitchToggle(!toggleState)}
            />
          </Tooltip>
        </div>
      </div>
    </PageSection>
  );
};

Header.propTypes = {
  title: PropTypes.string.isRequired,
};

export default Header;
