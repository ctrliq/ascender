//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import type { FormikContextType } from 'formik';
import type { OptionsField, Project, SummaryFieldRef } from 'types/api';

/* eslint no-nested-ternary: 0 */
import React, { useCallback, useState, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Formik, useField, useFormikContext } from 'formik';
import {
  Form,
  FormGroup,
  Title,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { useConfig } from 'contexts/Config';
import AnsibleSelect from 'components/AnsibleSelect';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import OrganizationLookup from 'components/Lookup/OrganizationLookup';
import ExecutionEnvironmentLookup from 'components/Lookup/ExecutionEnvironmentLookup';
import { CredentialTypesAPI, ProjectsAPI } from 'api';
import { required } from 'util/validators';
import { FormColumnLayout, SubFormLayout } from 'components/FormLayout';
import getProjectHelpText from './Project.helptext';
import {
  GitSubForm,
  SvnSubForm,
  ArchiveSubForm,
  // InsightsSubForm,
  ManualSubForm,
} from './ProjectSubForms';

/**
 * What the project form holds. Every field maps to one the project has, so
 * the rest is left open for the scm subforms, which each add their own.
 */
export interface ProjectFormValues {
  name?: string;
  description?: string;
  scm_type?: string;
  scm_update_on_launch?: boolean;
  local_path?: string;
  organization?: SummaryFieldRef | null;
  default_environment?: SummaryFieldRef | null;
  signature_validation_credential?: SummaryFieldRef | null;
  credential?: SummaryFieldRef | null;
  [key: string]: unknown;
}

const fetchCredentials = async (credential?: SummaryFieldRef) => {
  const [
    {
      data: {
        results: [scmCredentialType],
      },
    },
    // {
    //   data: {
    //     results: [insightsCredentialType],
    //   },
    // },
    {
      data: {
        results: [cryptographyCredentialType],
      },
    },
  ] = await Promise.all([
    CredentialTypesAPI.read({ kind: 'scm' }),
    // CredentialTypesAPI.read({ name: 'Insights' }),
    CredentialTypesAPI.read({ kind: 'cryptography' }),
  ]);

  const scmTypeId = scmCredentialType?.id;
  const cryptographyTypeId = cryptographyCredentialType?.id;

  if (!credential) {
    return {
      scm: { typeId: scmTypeId },
      // insights: { typeId: insightsCredentialType.id },
      cryptography: { typeId: cryptographyTypeId },
    };
  }

  const { credential_type_id } = credential;
  return {
    scm: {
      typeId: scmTypeId,
      value: credential_type_id === scmTypeId ? credential : null,
    },
    // insights: {
    //   typeId: insightsCredentialType.id,
    //   value:
    //     credential_type_id === insightsCredentialType.id ? credential : null,
    // },
    cryptography: {
      typeId: cryptographyTypeId,
      value: credential_type_id === cryptographyTypeId ? credential : null,
    },
  };
};

/**
 * The credential the form holds for one kind, and the type it has to be.
 *
 * typeId comes from the credential types endpoint and decides which lookup
 * the field opens; value is what the user has chosen, null until they do.
 */
export interface ProjectCredentialField {
  typeId?: number | null;
  value?: SummaryFieldRef | null;
}

/** The credentials a project form holds, by the kind each field is for. */
export interface ProjectCredentials {
  /** The credential the source control url is reached with. */
  scm: ProjectCredentialField;
  /** The key the project's content signature is validated against. */
  cryptography: ProjectCredentialField;
  [key: string]: ProjectCredentialField;
}

/** The scm subform's fields, which are swapped out when the type changes. */
export type ScmSubFormState = Record<string, string | number | boolean | null>;

export interface ProjectFormFieldsProps {
  project: Partial<Project>;
  project_base_dir?: string;
  project_local_paths?: string[];
  formik: FormikContextType<ProjectFormValues>;
  setCredentials: (credentials: ProjectCredentials) => void;
  setSignatureValidationCredentials: (credentials: ProjectCredentials) => void;
  credentials: ProjectCredentials;
  signatureValidationCredentials: ProjectCredentials;
  scmTypeOptions: OptionsField['choices'] | null;
  setScmSubFormState: (state: ScmSubFormState) => void;
  scmSubFormState: ScmSubFormState;
  [key: string]: unknown;
}

function ProjectFormFields({
  project,
  project_base_dir,
  project_local_paths,
  formik,
  setCredentials,
  setSignatureValidationCredentials,
  credentials,
  signatureValidationCredentials,
  scmTypeOptions,
  setScmSubFormState,
  scmSubFormState,
}: ProjectFormFieldsProps) {
  const { t } = useLingui();
  const projectHelpText = getProjectHelpText();
  const scmFormFields = {
    scm_url: '',
    scm_branch: '',
    scm_refspec: '',
    credential: '',
    signature_validation_credential: '',
    scm_clean: false,
    scm_delete_on_update: false,
    scm_track_submodules: false,
    scm_update_on_launch: false,
    allow_override: false,
    scm_update_cache_timeout: 0,
  };
  const { setFieldValue, setFieldTouched } =
    useFormikContext<ProjectFormValues>();

  const [scmTypeField, scmTypeMeta, scmTypeHelpers] = useField({
    name: 'scm_type',
    validate: required(t`Set a value for this field`),
  });
  const [organizationField, organizationMeta, organizationHelpers] =
    useField('organization');

  const [
    executionEnvironmentField,
    executionEnvironmentMeta,
    executionEnvironmentHelpers,
  ] = useField('default_environment');

  /* Save current scm subform field values to state */
  const saveSubFormState = (form: FormikContextType<ProjectFormValues>) => {
    const currentScmFormFields: ScmSubFormState = { ...scmFormFields };

    Object.keys(currentScmFormFields).forEach((label) => {
      currentScmFormFields[label] = form.values[label] as string;
    });

    setScmSubFormState(currentScmFormFields);
  };

  /**
   * If scm type is !== the initial scm type value,
   * reset scm subform field values to defaults.
   * If scm type is === the initial scm type value,
   * reset scm subform field values to scmSubFormState.
   */
  const resetScmTypeFields = (
    value: string,
    form: FormikContextType<ProjectFormValues>
  ) => {
    if (form.values.scm_type === form.initialValues.scm_type) {
      saveSubFormState(formik);
    }

    Object.keys(scmFormFields).forEach((label) => {
      if (value === form.initialValues.scm_type) {
        form.setFieldValue(label, scmSubFormState[label]);
      } else {
        form.setFieldValue(
          label,
          scmFormFields[label as keyof typeof scmFormFields]
        );
      }
      form.setFieldTouched(label, false);
    });
  };

  const handleCredentialSelection = useCallback(
    (type: string, value: SummaryFieldRef | null) => {
      setCredentials({
        ...credentials,
        [type]: {
          ...credentials[type],
          value,
        },
      });
    },
    [credentials, setCredentials]
  );

  const handleSignatureValidationCredentialSelection = useCallback(
    (type: string, value: SummaryFieldRef | null) => {
      setSignatureValidationCredentials({
        ...signatureValidationCredentials,
        [type]: {
          ...signatureValidationCredentials[type],
          value,
        },
      });
    },
    [signatureValidationCredentials, setSignatureValidationCredentials]
  );

  const handleSignatureValidationCredentialChange = useCallback(
    (value: SummaryFieldRef | null) => {
      handleSignatureValidationCredentialSelection('cryptography', value);
      setFieldValue('signature_validation_credential', value);
      setFieldTouched('signature_validation_credential', true, false);
    },
    [
      handleSignatureValidationCredentialSelection,
      setFieldValue,
      setFieldTouched,
    ]
  );

  const handleOrganizationUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const handleExecutionEnvironmentUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('default_environment', value);
      setFieldTouched('default_environment', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormField
        id="project-name"
        label={t`Name`}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="project-description"
        label={t`Description`}
        name="description"
        type="text"
      />
      <OrganizationLookup
        helperTextInvalid={organizationMeta.error}
        isValid={!organizationMeta.touched || !organizationMeta.error}
        onBlur={() => organizationHelpers.setTouched(true)}
        onChange={handleOrganizationUpdate}
        value={organizationField.value}
        required
        autoPopulate={!project?.id}
        validate={required(t`Select a value for this field`)}
      />
      <ExecutionEnvironmentLookup
        helperTextInvalid={executionEnvironmentMeta.error}
        isValid={
          !executionEnvironmentMeta.touched || !executionEnvironmentMeta.error
        }
        onBlur={() => executionEnvironmentHelpers.setTouched(true)}
        value={executionEnvironmentField.value}
        popoverContent={projectHelpText.executionEnvironment}
        onChange={handleExecutionEnvironmentUpdate}
        tooltip={t`Select an organization before editing the default execution environment.`}
        globallyAvailable
        isDisabled={!organizationField.value}
        organizationId={organizationField.value?.id}
        isDefaultEnvironment
        fieldName="default_environment"
      />
      <FormGroup
        fieldId="project-scm-type"
        isRequired
        label={t`Source Control Type`}
      >
        <AnsibleSelect
          {...scmTypeField}
          id="scm_type"
          data={[
            {
              value: '',
              key: '',
              label: t`Choose a Source Control Type`,
              isDisabled: true,
            },
            ...(scmTypeOptions ?? []).map(([choice, label]) => {
              // The manual type is the empty scm_type, which the select
              // cannot hold as a value because the prompt row above uses it.
              const value =
                choice === '' || choice === null ? 'manual' : choice;
              return {
                label,
                value,
                key: value,
              };
            }),
          ]}
          onChange={(event, value) => {
            scmTypeHelpers.setValue(value);
            resetScmTypeFields(value, formik);
          }}
        />
        {scmTypeMeta.touched && scmTypeMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {scmTypeMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <CredentialLookup
        credentialTypeId={signatureValidationCredentials.cryptography.typeId}
        label={t`Content Signature Validation Credential`}
        onChange={handleSignatureValidationCredentialChange}
        value={signatureValidationCredentials.cryptography.value}
        tooltip={projectHelpText.signatureValidation}
      />
      {formik.values.scm_type !== '' && (
        <SubFormLayout>
          <Title size="md" headingLevel="h4">
            {t`Type Details`}
          </Title>
          <FormColumnLayout>
            {
              {
                manual: (
                  <ManualSubForm
                    localPath={formik.initialValues.local_path}
                    project_base_dir={project_base_dir}
                    project_local_paths={project_local_paths}
                  />
                ),
                git: (
                  <GitSubForm
                    credential={credentials.scm}
                    onCredentialSelection={handleCredentialSelection}
                    scmUpdateOnLaunch={formik.values.scm_update_on_launch}
                  />
                ),
                svn: (
                  <SvnSubForm
                    credential={credentials.scm}
                    onCredentialSelection={handleCredentialSelection}
                    scmUpdateOnLaunch={formik.values.scm_update_on_launch}
                  />
                ),
                archive: (
                  <ArchiveSubForm
                    credential={credentials.scm}
                    onCredentialSelection={handleCredentialSelection}
                    scmUpdateOnLaunch={formik.values.scm_update_on_launch}
                  />
                ),
              }[formik.values.scm_type as 'manual' | 'git' | 'svn' | 'archive']
            }
          </FormColumnLayout>
        </SubFormLayout>
      )}
    </>
  );
}

export interface ProjectFormProps {
  /** The project being edited, absent on the add form. */
  project?: Partial<Project>;
  submitError?: unknown;
  handleCancel: () => void;
  handleSubmit: (values: ProjectFormValues) => void;
  [key: string]: unknown;
}

function ProjectForm({
  project = {},
  submitError = null,
  ...props
}: ProjectFormProps) {
  const { handleCancel, handleSubmit } = props;
  const { summary_fields = {} } = project;
  const { project_base_dir, project_local_paths } = useConfig();
  const [contentError, setContentError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scmSubFormState, setScmSubFormState] = useState<ScmSubFormState>({
    scm_url: '',
    scm_branch: '',
    scm_refspec: '',
    credential: '',
    signature_validation_credential: '',
    scm_clean: false,
    scm_delete_on_update: false,
    scm_track_submodules: false,
    scm_update_on_launch: false,
    allow_override: false,
    scm_update_cache_timeout: 0,
  });
  const [scmTypeOptions, setScmTypeOptions] = useState<
    OptionsField['choices'] | null
  >(null);
  const [credentials, setCredentials] = useState<ProjectCredentials>({
    scm: { typeId: null, value: null },
    // insights: { typeId: null, value: null },
    cryptography: { typeId: null, value: null },
  });
  const [signatureValidationCredentials, setSignatureValidationCredentials] =
    useState<ProjectCredentials>({
      scm: { typeId: null, value: null },
      // insights: { typeId: null, value: null },
      cryptography: { typeId: null, value: null },
    });

  useEffect(() => {
    async function fetchData() {
      try {
        const credentialResponse = fetchCredentials(summary_fields.credential);
        const signatureValidationCredentialResponse = fetchCredentials(
          summary_fields.signature_validation_credential
        );
        const { data: options } = await ProjectsAPI.readOptions();
        const choices = options.actions.GET?.scm_type?.choices ?? [];

        setCredentials(await credentialResponse);
        setSignatureValidationCredentials(
          await signatureValidationCredentialResponse
        );
        setScmTypeOptions(choices);
      } catch (error) {
        setContentError(error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [
    summary_fields.credential,
    summary_fields.signature_validation_credential,
  ]);

  if (isLoading) {
    return <ContentLoading />;
  }

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  return (
    <Formik<ProjectFormValues>
      initialValues={{
        allow_override: project.allow_override || false,
        base_dir: project_base_dir || '',
        credential: project.summary_fields?.credential || null,
        description: project.description || '',
        local_path: project.local_path ?? '',
        name: project.name || '',
        organization: project.summary_fields?.organization || null,
        scm_branch: project.scm_branch || '',
        scm_clean: project.scm_clean || false,
        scm_delete_on_update: project.scm_delete_on_update || false,
        scm_track_submodules: project.scm_track_submodules || false,
        scm_refspec: project.scm_refspec || '',
        // A project with a blank type is a manual one, which the form names;
        // a project the form has not been given yet has no type at all.
        scm_type: project.scm_type === '' ? 'manual' : (project.scm_type ?? ''),
        scm_update_cache_timeout: project.scm_update_cache_timeout || 0,
        scm_update_on_launch: project.scm_update_on_launch || false,
        scm_url: project.scm_url || '',
        signature_validation_credential:
          project.summary_fields?.signature_validation_credential || null,
        default_environment:
          project.summary_fields?.default_environment || null,
        webhook_service: project.webhook_service || '',
        webhook_url: project?.related?.webhook_receiver
          ? `${document.location.origin}${project.related.webhook_receiver}`
          : '',
        webhook_key: project.webhook_key || '',
        webhook_ref_filter: project.webhook_ref_filter || '',
      }}
      onSubmit={handleSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <ProjectFormFields
              project={project}
              project_base_dir={project_base_dir}
              project_local_paths={project_local_paths}
              formik={formik}
              setCredentials={setCredentials}
              setSignatureValidationCredentials={
                setSignatureValidationCredentials
              }
              credentials={credentials}
              signatureValidationCredentials={signatureValidationCredentials}
              scmTypeOptions={scmTypeOptions}
              setScmSubFormState={setScmSubFormState}
              scmSubFormState={scmSubFormState}
            />
            <FormSubmitError error={submitError} />
            <FormActionGroup
              onCancel={handleCancel}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </Formik>
  );
}

export default ProjectForm;
