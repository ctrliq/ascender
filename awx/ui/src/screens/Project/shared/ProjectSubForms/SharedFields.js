import React, { useCallback } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useFormikContext } from 'formik';
import { FormGroup, Title } from '@patternfly/react-core';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import FormField, { CheckboxField } from 'components/FormField';
import { required } from 'util/validators';
import { FormCheckboxLayout, FormFullWidthLayout } from 'components/FormLayout';
import getProjectHelpStrings from '../Project.helptext';

export const UrlFormField = ({ tooltip }) => {
  const { i18n } = useLingui();
  return (
    <FormField
      id="project-scm-url"
      isRequired
      label={i18n._(msg`Source Control URL`)}
      name="scm_url"
      tooltip={tooltip}
      tooltipMaxWidth="350px"
      type="text"
      validate={required(null)}
    />
  );
};

export const BranchFormField = ({ label }) => {
  const { i18n } = useLingui();
  const projectHelpStrings = getProjectHelpStrings(i18n);
  return (
    <FormField
      id="project-scm-branch"
      name="scm_branch"
      type="text"
      label={label}
      tooltip={projectHelpStrings.branchFormField}
    />
  );
};

export const ScmCredentialFormField = ({
  credential,
  onCredentialSelection,
}) => {
  const { i18n } = useLingui();
  const { setFieldValue, setFieldTouched } = useFormikContext();

  const onCredentialChange = useCallback(
    (value) => {
      onCredentialSelection('scm', value);
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [onCredentialSelection, setFieldValue, setFieldTouched]
  );

  return (
    <CredentialLookup
      credentialTypeId={credential.typeId}
      label={i18n._(msg`Source Control Credential`)}
      value={credential.value}
      onChange={onCredentialChange}
    />
  );
};

export const ScmTypeOptions = ({ scmUpdateOnLaunch, hideAllowOverride }) => {
  const { i18n } = useLingui();
  const { values } = useFormikContext();
  const projectHelpStrings = getProjectHelpStrings(i18n);

  return (
    <FormFullWidthLayout>
      <FormGroup fieldId="project-option-checkboxes" label={i18n._(msg`Options`)}>
        <FormCheckboxLayout>
          <CheckboxField
            id="option-scm-clean"
            name="scm_clean"
            label={i18n._(msg`Clean`)}
            tooltip={projectHelpStrings.options.clean}
          />
          <CheckboxField
            id="option-scm-delete-on-update"
            name="scm_delete_on_update"
            label={i18n._(msg`Delete`)}
            tooltip={projectHelpStrings.options.delete}
          />
          {values.scm_type === 'git' ? (
            <CheckboxField
              id="option-scm-track-submodules"
              name="scm_track_submodules"
              label={i18n._(msg`Track submodules`)}
              tooltip={projectHelpStrings.options.trackSubModules}
            />
          ) : null}
          <CheckboxField
            id="option-scm-update-on-launch"
            name="scm_update_on_launch"
            label={i18n._(msg`Update Revision on Launch`)}
            tooltip={projectHelpStrings.options.updateOnLaunch}
          />
          {!hideAllowOverride && (
            <CheckboxField
              id="option-allow-override"
              name="allow_override"
              label={i18n._(msg`Allow Branch Override`)}
              tooltip={projectHelpStrings.options.allowBranchOverride}
            />
          )}
        </FormCheckboxLayout>
      </FormGroup>

      {scmUpdateOnLaunch && (
        <>
          <Title size="md" headingLevel="h4">
            {i18n._(msg`Option Details`)}
          </Title>
          <FormField
            id="project-cache-timeout"
            name="scm_update_cache_timeout"
            type="number"
            min="0"
            label={i18n._(msg`Cache Timeout`)}
            tooltip={projectHelpStrings.options.cacheTimeout}
          />
        </>
      )}
    </FormFullWidthLayout>
  );
};
