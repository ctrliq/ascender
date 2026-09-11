import type { Credential, SummaryFieldRef, Untyped } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Label } from '@patternfly/react-core';
import { toTitleCase } from 'util/strings';

export interface CredentialChipProps {
  /**
   * Either the credential itself or the reference summary_fields inlines; only
   * name, kind, cloud and the vault id are read off it.
   */
  credential: Credential | SummaryFieldRef;
  isReadOnly: boolean;
  ouiaId?: string;
  onClick?: (...args: Untyped[]) => void;
  [key: string]: unknown;
}

function CredentialChip({
  credential,
  isReadOnly,
  ouiaId,
  onClick,
  ...props
}: CredentialChipProps) {
  const { t } = useLingui();
  let type;
  if (credential.cloud) {
    type = t`Cloud`;
  } else if (credential.kind === 'gpg_public_key') {
    type = t`GPG Public Key`;
  } else if (credential.kind === 'aws' || credential.kind === 'ssh') {
    type = credential.kind.toUpperCase();
  } else {
    type = toTitleCase(credential.kind);
  }

  const buildCredentialName = () => {
    if (credential.kind === 'vault' && credential.inputs?.vault_id) {
      return `${credential.name} | ${credential.inputs.vault_id}`;
    }
    return `${credential.name}`;
  };

  const chipText = `${type}: ${buildCredentialName()}`;

  return (
    <Label
      variant="outline"
      {...(ouiaId ? { 'data-ouia-component-id': ouiaId } : {})}
      {...(!isReadOnly && onClick
        ? { onClose: onClick, closeBtnAriaLabel: chipText }
        : {})}
      {...props}
    >
      <strong>{type}: </strong>
      {buildCredentialName()}
    </Label>
  );
}

export { CredentialChip as _CredentialChip };
export default CredentialChip;
