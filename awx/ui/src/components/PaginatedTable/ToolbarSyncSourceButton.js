import React from 'react';
import { func } from 'prop-types';
import { Button, DropdownItem, Tooltip } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import { msg } from '@lingui/macro';
import { useKebabifiedMenu } from 'contexts/Kebabified';

function ToolbarSyncSourceButton({ onClick }) {
  const { i18n } = useLingui();
  const { isKebabified } = useKebabifiedMenu();

  if (isKebabified) {
    return (
      <DropdownItem
        ouiaId="sync-all-button"
        key="add"
        component="button"
        onClick={onClick}
      >
        {i18n._(msg`Sync all`)}
      </DropdownItem>
    );
  }

  return (
    <Tooltip key="update" content={i18n._(msg`Sync all sources`)} position="top">
      <Button
        ouiaId="sync-all-button"
        onClick={onClick}
        aria-label={i18n._(msg`Sync all`)}
        variant="secondary"
      >
        {i18n._(msg`Sync all`)}
      </Button>
    </Tooltip>
  );
}

ToolbarSyncSourceButton.propTypes = {
  onClick: func,
};
ToolbarSyncSourceButton.defaultProps = {
  onClick: null,
};

export default ToolbarSyncSourceButton;
