import React, { useContext, useState } from 'react';
import { Button, FormGroup, Modal } from '@patternfly/react-core';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { func } from 'prop-types';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import AnsibleSelect from 'components/AnsibleSelect';

function LinkModal({ header, onConfirm }) {
  const { i18n } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  const { linkToEdit } = useContext(WorkflowStateContext);
  const [linkType, setLinkType] = useState(
    linkToEdit ? linkToEdit.linkType : 'success'
  );
  return (
    <Modal
      width={600}
      header={header}
      isOpen
      title={i18n._(msg`Workflow Link`)}
      aria-label={i18n._(msg`Workflow link modal`)}
      onClose={() => dispatch({ type: 'CANCEL_LINK_MODAL' })}
      actions={[
        <Button
          ouiaId="link-confirm-button"
          id="link-confirm"
          key="save"
          variant="primary"
          aria-label={i18n._(msg`Save link changes`)}
          onClick={() => onConfirm(linkType)}
        >
          {i18n._(msg`Save`)}
        </Button>,
        <Button
          ouiaId="link-cancel-button"
          id="link-cancel"
          key="cancel"
          variant="link"
          aria-label={i18n._(msg`Cancel link changes`)}
          onClick={() => dispatch({ type: 'CANCEL_LINK_MODAL' })}
        >
          {i18n._(msg`Cancel`)}
        </Button>,
      ]}
    >
      <FormGroup fieldId="link-select" label={i18n._(msg`Run`)}>
        <AnsibleSelect
          id="link-select"
          name="linkType"
          value={linkType}
          data={[
            {
              value: 'always',
              key: 'always',
              label: i18n._(msg`Always`),
            },
            {
              value: 'success',
              key: 'success',
              label: i18n._(msg`On Success`),
            },
            {
              value: 'failure',
              key: 'failure',
              label: i18n._(msg`On Failure`),
            },
          ]}
          onChange={(event, value) => {
            setLinkType(value);
          }}
        />
      </FormGroup>
    </Modal>
  );
}

LinkModal.propTypes = {
  onConfirm: func.isRequired,
};

export default LinkModal;
