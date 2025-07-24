import React from 'react';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Chip } from '@patternfly/react-core';
import { Credential } from 'types';
import { toTitleCase } from 'util/strings';

function CredentialChip({ credential, ...props }) {
  const { i18n } = useLingui();
  let type;
  if (credential.cloud) {
    type = i18n._(msg`Cloud`);
  } else if (credential.kind === 'gpg_public_key') {
    type = i18n._(msg`GPG Public Key`);
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

  return (
    <Chip {...props}>
      <strong>{type}: </strong>
      {buildCredentialName()}
    </Chip>
  );
}
CredentialChip.propTypes = {
  credential: Credential.isRequired,
};

export { CredentialChip as _CredentialChip };
export default CredentialChip;
