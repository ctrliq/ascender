import React from 'react';
import {
	Button,
	Tooltip,
	DropdownItem,
} from '@patternfly/react-core';

import { useLingui } from '@lingui/react/macro';

import { useKebabifiedMenu } from 'contexts/Kebabified';

function ToolbarSyncSourceButton({ onClick = null }) {
  const { t } = useLingui();
  const { isKebabified } = useKebabifiedMenu();

  if (isKebabified) {
    return (
      <DropdownItem
        ouiaId="sync-all-button"
        key="add"
        component="button"
        onClick={onClick}
      >
        {t`Sync all`}
      </DropdownItem>
    );
  }

  return (
    <Tooltip
      key="update"
      content={t`Sync all sources`}
      position="top"
    >
      <Button
        ouiaId="sync-all-button"
        onClick={onClick}
        aria-label={t`Sync all`}
        variant="secondary"
      >
        {t`Sync all`}
      </Button>
    </Tooltip>
  );
}

export default ToolbarSyncSourceButton;
