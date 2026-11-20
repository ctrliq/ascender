import React from 'react';
import { Plural, useLingui } from '@lingui/react/macro';
import { Button, DropdownItem } from '@patternfly/react-core';

import { useKebabifiedMenu } from 'contexts/Kebabified';
import Tooltip from '../Tooltip';

export interface HealthCheckButtonProps {
  isDisabled: boolean;
  onClick: (event?: React.MouseEvent) => void;
  selectedItems: unknown[];
  /** Whether a check is already running, which is the button's spinner. */
  healthCheckPending: boolean;
  [key: string]: unknown;
}

function HealthCheckButton({
  isDisabled,
  onClick,
  selectedItems,
  healthCheckPending,
}: HealthCheckButtonProps) {
  const { t } = useLingui();
  const { isKebabified } = useKebabifiedMenu();

  const selectedItemsCount = selectedItems.length;
  // The api only checks execution nodes and skips the rest, so a selection
  // holding none of them leaves the button disabled, and the tooltip says why
  // rather than inviting a click.
  const hasExecutionNode = selectedItems.some(
    (item) => (item as { node_type?: string })?.node_type === 'execution'
  );

  const buildTooltip = () => {
    if (selectedItemsCount && !hasExecutionNode) {
      return t`Health checks can only be run on execution nodes.`;
    }
    return selectedItemsCount ? (
      <Plural
        value={selectedItemsCount}
        one="Click to run a health check on the selected instance."
        other="Click to run a health check on the selected instances."
      />
    ) : (
      t`Select an instance to run a health check.`
    );
  };

  if (isKebabified) {
    return (
      <Tooltip data-cy="healthCheckTooltip" content={buildTooltip()}>
        <DropdownItem
          key="approve"
          isDisabled={isDisabled || !selectedItemsCount}
          component="button"
          onClick={onClick}
          ouiaId="health-check"
          isLoading={healthCheckPending}
        >
          {healthCheckPending ? t`Running Health Check` : t`Run Health Check`}
        </DropdownItem>
      </Tooltip>
    );
  }
  return (
    <Tooltip data-cy="healthCheckTooltip" content={buildTooltip()}>
      <div>
        <Button
          isDisabled={isDisabled || !selectedItemsCount}
          variant="secondary"
          ouiaId="health-check"
          onClick={onClick}
          isLoading={healthCheckPending}
          spinnerAriaLabel={t`Running Health Check`}
        >
          {healthCheckPending ? t`Running Health Check` : t`Run Health Check`}
        </Button>
      </div>
    </Tooltip>
  );
}

export default HealthCheckButton;
