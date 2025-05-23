import React, { useState } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Button, TextInput, Tooltip } from '@patternfly/react-core';
import { RocketIcon } from '@patternfly/react-icons';

import AlertModal from 'components/AlertModal';

const MAX_RETENTION = 99999;

const clamp = (val, min, max) => {
  if (val < min) {
    return min;
  }
  if (val > max) {
    return max;
  }
  return val;
};

function LaunchManagementPrompt({
  isOpen,
  isLoading,
  onClick,
  onClose,
  onConfirm,
  defaultDays,
}) {
  const { i18n } = useLingui();
  const [dataRetention, setDataRetention] = useState(defaultDays);
  return (
    <>
      <Tooltip content={i18n._(msg`Launch management job`)} position="left">
        <Button
          aria-label={i18n._(msg`Launch management job`)}
          variant="plain"
          onClick={onClick}
          isDisabled={isLoading}
        >
          <RocketIcon />
        </Button>
      </Tooltip>
      <AlertModal
        isOpen={isOpen}
        variant="info"
        onClose={onClose}
        title={i18n._(msg`Launch management job`)}
        label={i18n._(msg`Launch management job`)}
        actions={[
          <Button
            id="launch-job-confirm-button"
            key="delete"
            variant="primary"
            isDisabled={isLoading}
            aria-label={i18n._(msg`Launch`)}
            onClick={() => onConfirm(dataRetention)}
          >
            {i18n._(msg`Launch`)}
          </Button>,
          <Button
            id="launch-job-cancel-button"
            key="cancel"
            variant="link"
            aria-label={i18n._(msg`Cancel`)}
            onClick={onClose}
          >
            {i18n._(msg`Cancel`)}
          </Button>,
        ]}
      >
        {i18n._(msg`Set how many days of data should be retained.`)}
        <TextInput
          value={dataRetention}
          type="number"
          onChange={(value) => setDataRetention(clamp(value, 0, MAX_RETENTION))}
          aria-label={i18n._(msg`Data retention period`)}
        />
      </AlertModal>
    </>
  );
}

export default LaunchManagementPrompt;
