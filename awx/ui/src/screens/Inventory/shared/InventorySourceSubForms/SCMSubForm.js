import React, { useCallback, useEffect, useState } from 'react';
import { useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import {
	Button,
	FormGroup,
	FormHelperText,
	HelperText,
	HelperTextItem,
	MenuToggle,
	Select,
	SelectList,
	SelectOption,
	TextInputGroup,
	TextInputGroupMain,
	TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
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
  const { t } = useLingui();
  const helpText = getHelpText(t);
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const [sourcePath, setSourcePath] = useState([]);
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const [credentialField] = useField('credential');

  const [projectField, projectMeta, projectHelpers] =
    useField('source_project');
  const [sourcePathField, sourcePathMeta, sourcePathHelpers] = useField({
    name: 'source_path',
    validate: required(t`Select a value for this field`),
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

  const isValid =
    (!sourcePathMeta.error || !sourcePathMeta.touched) &&
    !sourcePathError?.message;

  const filteredPaths = sourcePath.filter((path) =>
    path.toLowerCase().includes(filterValue.toLowerCase())
  );

  const showCreateOption =
    filterValue.trim() &&
    !sourcePath.some(
      (path) => path.toLowerCase() === filterValue.trim().toLowerCase()
    );

  return (
    <>
      {projectField.value?.allow_override && (
        <FormField
          id="project-scm-branch"
          name="scm_branch"
          type="text"
          label={t`Source Control Branch/Tag/Commit`}
          tooltip={helpText.sourceControlBranch}
        />
      )}
      <CredentialLookup
        credentialTypeKind="cloud"
        label={t`Credential`}
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
        validate={required(t`Select a value for this field`)}
      />
      <FormGroup
        fieldId="source_path"
        isRequired
        label={t`Inventory file`}
        labelHelp={<Popover content={helpText.sourcePath} />}
      >
        <Select
          id="source_path"
          isOpen={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) setFilterValue('');
          }}
          onSelect={(_event, value) => {
            setIsOpen(false);
            const trimmed = typeof value === 'string' ? value.trim() : value;
            sourcePathHelpers.setValue(trimmed);
            setFilterValue('');
          }}
          aria-label={t`Select source path`}
          data-ouia-component-id="InventorySourceForm-source_path"
          toggle={(toggleRef) => (
            <MenuToggle
              ref={toggleRef}
              variant="typeahead"
              onClick={() => setIsOpen(!isOpen)}
              isExpanded={isOpen}
              status={isValid ? undefined : 'danger'}
            >
              <TextInputGroup isPlain>
                <TextInputGroupMain
                  value={filterValue !== '' ? filterValue : (sourcePathField.value || '')}
                  onClick={() => setIsOpen(true)}
                  onChange={(_event, val) => {
                    setFilterValue(val);
                    setIsOpen(true);
                  }}
                  onFocus={() => {
                    if (sourcePathField.value && filterValue === '') {
                      setFilterValue(sourcePathField.value);
                    }
                  }}
                  autoComplete="off"
                  placeholder={t`Select source path`}
                  aria-label={t`Select source path`}
                />
                {(filterValue || sourcePathField.value) && (
                  <TextInputGroupUtilities>
                    <Button icon={<TimesIcon />}
                      variant="plain"
                      onClick={() => {
                        sourcePathHelpers.setValue('');
                        setFilterValue('');
                      }}
                      aria-label={t`Clear`}
                     />
                  </TextInputGroupUtilities>
                )}
              </TextInputGroup>
            </MenuToggle>
          )}
        >
          <SelectList>
            {filteredPaths.map((path) => (
              <SelectOption key={path} id={path} value={path}>
                {path}
              </SelectOption>
            ))}
            {showCreateOption && (
              <SelectOption
                value={filterValue.trim()}
                onClick={() => {
                  const trimmed = filterValue.trim();
                  setSourcePath((prev) => [...prev, trimmed]);
                }}
              >
                {t`Set source path to`} &quot;{filterValue.trim()}&quot;
              </SelectOption>
            )}
            {filteredPaths.length === 0 && !showCreateOption && (
              <SelectOption isDisabled>
                {t`No results found`}
              </SelectOption>
            )}
          </SelectList>
        </Select>
        {((sourcePathMeta.touched && sourcePathMeta.error) || sourcePathError?.message) && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {sourcePathError?.message || sourcePathMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
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
