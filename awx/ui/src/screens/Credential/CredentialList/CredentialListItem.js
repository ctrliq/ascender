import React, { useState, useCallback } from 'react';
import { string, bool, func } from 'prop-types';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Link } from 'react-router-dom';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { timeOfDay } from 'util/dates';

import { Credential } from 'types';
import { CredentialsAPI } from 'api';
import CopyButton from 'components/CopyButton';

function CredentialListItem({
  credential,
  detailUrl,
  isSelected,
  onSelect,
  onCopy,
  fetchCredentials,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const [isDisabled, setIsDisabled] = useState(false);

  const labelId = `check-action-${credential.id}`;
  const canEdit = credential.summary_fields.user_capabilities.edit;

  const copyCredential = useCallback(async () => {
    const response = await CredentialsAPI.copy(credential.id, {
      name: `${credential.name} @ ${timeOfDay()}`,
    });
    if (response.status === 201) {
      onCopy(response.data.id);
    }
    await fetchCredentials();
  }, [credential.id, credential.name, fetchCredentials, onCopy]);

  const handleCopyStart = useCallback(() => {
    setIsDisabled(true);
  }, []);

  const handleCopyFinish = useCallback(() => {
    setIsDisabled(false);
  }, []);

  return (
    <Tr id={`${credential.id}`} ouiaId={`${credential.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(msg`Selected`)}
      />
      <TdBreakWord id={labelId} dataLabel={i18n._(msg`Name`)}>
        <Link to={`${detailUrl}`}>
          <b>{credential.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={i18n._(msg`Type`)}>
        {credential.summary_fields.credential_type.name}
      </Td>
      <ActionsTd dataLabel={i18n._(msg`Actions`)}>
        <ActionItem visible={canEdit} tooltip={i18n._(msg`Edit Credential`)}>
          <Button
            ouiaId={`${credential.id}-edit-button`}
            isDisabled={isDisabled}
            aria-label={i18n._(msg`Edit Credential`)}
            variant="plain"
            component={Link}
            to={`/credentials/${credential.id}/edit`}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
        <ActionItem
          tooltip={i18n._(msg`Copy Credential`)}
          visible={credential.summary_fields.user_capabilities.copy}
        >
          <CopyButton
            isDisabled={isDisabled}
            onCopyStart={handleCopyStart}
            onCopyFinish={handleCopyFinish}
            copyItem={copyCredential}
            errorMessage={i18n._(msg`Failed to copy credential.`)}
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

CredentialListItem.propTypes = {
  detailUrl: string.isRequired,
  credential: Credential.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default CredentialListItem;
