import React from 'react';
import { Plural, t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { Button, DropdownItem, Tooltip } from '@patternfly/react-core';
import { useKebabifiedMenu } from 'contexts/Kebabified';

function HealthCheckButton({
  isDisabled,
  onClick,
  selectedItems,
  healthCheckPending,
}) {
  const { i18n } = useLingui();
  const { isKebabified } = useKebabifiedMenu();

  const selectedItemsCount = selectedItems.length;

  const buildTooltip = () =>
    selectedItemsCount ? (
      <Plural
        value={selectedItemsCount}
        one="Click to run a health check on the selected instance."
        other="Click to run a health check on the selected instances."
      />
    ) : (
      i18n._(t`Select an instance to run a health check.`)
    );

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
          spinnerAriaLabel={i18n._(t`Running health check`)}
        >
          {healthCheckPending
            ? i18n._(t`Running health check`)
            : i18n._(t`Run health check`)}
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
          spinnerAriaLabel={i18n._(t`Running health check`)}
        >
          {healthCheckPending
            ? i18n._(t`Running health check`)
            : i18n._(t`Run health check`)}
        </Button>
      </div>
    </Tooltip>
  );
}

export default HealthCheckButton;
