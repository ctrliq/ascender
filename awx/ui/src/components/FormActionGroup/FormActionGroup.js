import React from 'react';
import PropTypes from 'prop-types';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { ActionGroup, Button } from '@patternfly/react-core';
import { FormFullWidthLayout } from '../FormLayout';

const FormActionGroup = ({ onCancel, onSubmit, submitDisabled }) => {
  const { i18n } = useLingui();
  return (
    <FormFullWidthLayout>
      <ActionGroup>
        <Button
          ouiaId="form-save-button"
          aria-label={i18n._(msg`Save`)}
          variant="primary"
          type="button"
          onClick={onSubmit}
          isDisabled={submitDisabled}
        >
          {i18n._(msg`Save`)}
        </Button>
        <Button
          ouiaId="form-cancel-button"
          aria-label={i18n._(msg`Cancel`)}
          variant="link"
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
        >
          {i18n._(msg`Cancel`)}
        </Button>
      </ActionGroup>
    </FormFullWidthLayout>
  );
};

FormActionGroup.propTypes = {
  onCancel: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  submitDisabled: PropTypes.bool,
};

FormActionGroup.defaultProps = {
  submitDisabled: false,
};

export default FormActionGroup;
