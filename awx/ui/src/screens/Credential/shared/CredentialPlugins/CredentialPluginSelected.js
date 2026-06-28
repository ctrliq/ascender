import React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import { Button, ButtonVariant, Tooltip } from '@patternfly/react-core';
import { KeyIcon } from '@patternfly/react-icons';
import CredentialChip from 'components/CredentialChip';

const SelectedCredential = styled.div`
  display: flex;
  justify-content: space-between;
  background-color: var(--pf-v6-global--BackgroundColor--100);
  border-bottom-color: var(--pf-v6-global--BorderColor--200);
`;

const SpacedCredentialChip = styled(CredentialChip)`
  margin: 5px 8px;
`;

const PluginHelpText = styled.p`
  margin-top: 5px;
`;

function CredentialPluginSelected({
  credential,
  onEditPlugin = () => {},
  onClearPlugin = () => {},
  fieldId,
}) {
  const { t } = useLingui();
  return (
    <>
      <SelectedCredential>
        <SpacedCredentialChip onClick={onClearPlugin} credential={credential} />
        <Tooltip
          content={t`Edit Credential Plugin Configuration`}
          position="top"
        >
          <Button icon={<KeyIcon />}
            ouiaId={`credential-field-${fieldId}-edit-plugin-button`}
            aria-label={t`Edit Credential Plugin Configuration`}
            onClick={onEditPlugin}
            variant={ButtonVariant.control}
           />
        </Tooltip>
      </SelectedCredential>
      <PluginHelpText>
        <Trans>
          This field will be retrieved from an external secret management system
          using the specified credential.
        </Trans>
      </PluginHelpText>
    </>
  );
}

export default CredentialPluginSelected;
