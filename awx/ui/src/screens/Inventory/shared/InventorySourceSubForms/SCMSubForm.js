import React, { useCallback, useEffect, useState } from 'react';
import { useField, useFormikContext } from 'formik';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  FormGroup,
  SelectVariant,
  Select,
  SelectOption,
} from '@patternfly/react-core';
import { ProjectsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { required } from 'util/validators';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import ProjectLookup from 'components/Lookup/ProjectLookup';
import Popover from 'components/Popover';
import FormField from 'components/FormField';
import {
  OptionsField,
  SourceVarsField,
  VerbosityField,
  EnabledVarField,
  EnabledValueField,
  HostFilterField,
} from './SharedFields';
import getHelpText from '../Inventory.helptext';

const SCMSubForm = ({ autoPopulateProject }) => {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const [isOpen, setIsOpen] = useState(false);
  const [sourcePath, setSourcePath] = useState([]);
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const [credentialField] = useField('credential');

  const [projectField, projectMeta, projectHelpers] =
    useField('source_project');
  const [sourcePathField, sourcePathMeta, sourcePathHelpers] = useField({
    name: 'source_path',
    validate: required(i18n._(msg`Select a value for this field`)),
  });
  const { error: sourcePathError, request: fetchSourcePath } = useRequest(
    useCallback(async (projectId) => {
      const { data } = await ProjectsAPI.readInventories(projectId);
      setSourcePath([...data, '/ (project root)']);
    }, []),
    []
  );
  useEffect(() => {
    if (projectMeta.initialValue) {
      fetchSourcePath(projectMeta.initialValue.id);
      if (sourcePathField.value === '') {
        sourcePathHelpers.setValue('/ (project root)');
      }
    } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSourcePath, projectMeta.initialValue]);

  const handleProjectUpdate = useCallback(
    (value) => {
      setFieldValue('source_project', value);
      setFieldTouched('source_project', true, false);
      setFieldValue('scm_branch', '', false);
      if (sourcePathField.value) {
        setFieldValue('source_path', '');
        setFieldTouched('source_path', false);
      }
      if (value) {
        fetchSourcePath(value.id);
      }
    },
    [fetchSourcePath, setFieldValue, setFieldTouched, sourcePathField.value]
  );
  const handleCredentialUpdate = useCallback(
    (value) => {
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [setFieldValue, setFieldTouched]
  );
  return (
    <>
      {projectField.value?.allow_override && (
        <FormField
          id="project-scm-branch"
          name="scm_branch"
          type="text"
          label={i18n._(msg`Source Control Branch/Tag/Commit`)}
          tooltip={helpText.sourceControlBranch}
        />
      )}
      <CredentialLookup
        credentialTypeKind="cloud"
        label={i18n._(msg`Credential`)}
        value={credentialField.value}
        onChange={handleCredentialUpdate}
      />
      <ProjectLookup
        value={projectField.value}
        isValid={!projectMeta.touched || !projectMeta.error}
        helperTextInvalid={projectMeta.error}
        onBlur={() => projectHelpers.setTouched()}
        onChange={handleProjectUpdate}
        required
        autoPopulate={autoPopulateProject}
        fieldName="source_project"
        validate={required(i18n._(msg`Select a value for this field`))}
      />
      <FormGroup
        fieldId="source_path"
        helperTextInvalid={sourcePathError?.message || sourcePathMeta.error}
        validated={
          (!sourcePathMeta.error || !sourcePathMeta.touched) &&
          !sourcePathError?.message
            ? 'default'
            : 'error'
        }
        isRequired
        label={i18n._(msg`Inventory file`)}
        labelIcon={<Popover content={helpText.sourcePath} />}
      >
        <Select
          ouiaId="InventorySourceForm-source_path"
          variant={SelectVariant.typeahead}
          onToggle={setIsOpen}
          isOpen={isOpen}
          selections={sourcePathField.value}
          id="source_path"
          isValid={
            (!sourcePathMeta.error || !sourcePathMeta.touched) &&
            !sourcePathError?.message
          }
          onSelect={(event, value) => {
            setIsOpen(false);
            value = value.trim();
            sourcePathHelpers.setValue(value);
          }}
          aria-label={i18n._(msg`Select source path`)}
          typeAheadAriaLabel={i18n._(msg`Select source path`)}
          placeholder={i18n._(msg`Select source path`)}
          createText={i18n._(msg`Set source path to`)}
          isCreatable
          onCreateOption={(value) => {
            value.trim();
            setSourcePath([...sourcePath, value]);
          }}
          noResultsFoundText={i18n._(msg`No results found`)}
        >
          {sourcePath.map((path) => (
            <SelectOption key={path} id={path} value={path} />
          ))}
        </Select>
      </FormGroup>
      <VerbosityField />
      <HostFilterField />
      <EnabledVarField />
      <EnabledValueField />
      <OptionsField showProjectUpdate />
      <SourceVarsField />
    </>
  );
};

export default SCMSubForm;
