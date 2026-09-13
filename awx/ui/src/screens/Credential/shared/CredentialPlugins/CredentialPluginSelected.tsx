import type { Credential } from 'types/api';
import React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button, ButtonVariant, Tooltip } from '@patternfly/react-core';
import { KeyIcon } from '@patternfly/react-icons';
import CredentialChip from 'components/CredentialChip';
import './CredentialPluginSelected.css';

export interface CredentialPluginSelectedProps {
  credential: Credential;
  onEditPlugin?: () => void;
  onClearPlugin?: () => void;
  fieldId?: string;
  [key: string]: unknown;
}

function CredentialPluginSelected({
  credential,
  onEditPlugin = () => {},
  onClearPlugin = () => {},
  fieldId,
}: CredentialPluginSelectedProps) {
  const { t } = useLingui();
  return (
    <>
      <div className="awx-credential-plugin-selected__credential">
        <CredentialChip
          className="awx-credential-plugin-selected__spaced-credential-chip"
          onClick={onClearPlugin}
          credential={credential}
        />
        <Tooltip
          content={t`Edit Credential Plugin Configuration`}
          position="top"
        >
          <Button
            icon={<KeyIcon />}
            ouiaId={`credential-field-${fieldId}-edit-plugin-button`}
            aria-label={t`Edit Credential Plugin Configuration`}
            onClick={onEditPlugin}
            variant={ButtonVariant.control}
          />
        </Tooltip>
      </div>
      <p className="awx-credential-plugin-selected__help-text">
        <Trans>
          This field will be retrieved from an external secret management system
          using the specified credential.
        </Trans>
      </p>
    </>
  );
}

export default CredentialPluginSelected;
