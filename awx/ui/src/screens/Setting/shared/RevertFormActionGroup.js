import React from 'react';
import PropTypes from 'prop-types';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { ActionGroup, Button } from '@patternfly/react-core';
import { FormFullWidthLayout } from 'components/FormLayout';

const RevertFormActionGroup = ({ children, onCancel, onRevert, onSubmit }) => {
  const { i18n } = useLingui();
  return (
    <FormFullWidthLayout>
      <ActionGroup>
        <Button
          aria-label={i18n._(t`Save`)}
          variant="primary"
          type="button"
          onClick={onSubmit}
          ouiaId="save-button"
        >
          {i18n._(t`Save`)}
        </Button>
        <Button
          aria-label={i18n._(t`Revert all to default`)}
          variant="secondary"
          type="button"
          onClick={onRevert}
          ouiaId="revert-all-button"
        >
          {i18n._(t`Revert all to default`)}
        </Button>
        {children}
        <Button
          aria-label={i18n._(t`Cancel`)}
          variant="link"
          type="button"
          onClick={onCancel}
          ouiaId="cancel-button"
        >
          {i18n._(t`Cancel`)}
        </Button>
      </ActionGroup>
    </FormFullWidthLayout>
  );
};

RevertFormActionGroup.propTypes = {
  onCancel: PropTypes.func.isRequired,
  onRevert: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};

export default RevertFormActionGroup;
