import 'styled-components/macro';
import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useField } from 'formik';
import { FormGroup, Alert } from '@patternfly/react-core';
import { required } from 'util/validators';
import AnsibleSelect from 'components/AnsibleSelect';
import FormField from 'components/FormField';
import Popover from 'components/Popover';
import useBrandName from 'hooks/useBrandName';
import getProjectHelpStrings from '../Project.helptext';

const ManualSubForm = ({
  localPath,
  project_base_dir,
  project_local_paths,
}) => {
  const { i18n } = useLingui();
  const projectHelpStrings = getProjectHelpStrings(i18n);
  const brandName = useBrandName();
  const localPaths = [...new Set([...project_local_paths, localPath])];
  const options = [
    {
      value: '',
      key: '',
      label: i18n._(msg`Choose a Playbook Directory`),
    },
    ...localPaths
      .filter((path) => path)
      .map((path) => ({
        value: path,
        key: path,
        label: path,
      })),
  ];
  const [pathField, pathMeta, pathHelpers] = useField({
    name: 'local_path',
    validate: required(i18n._(msg`Select a value for this field`)),
  });

  return (
    <>
      {options.length === 1 && (
        <Alert
          title={i18n._(msg`WARNING: `)}
          css="grid-column: 1/-1"
          variant="warning"
          isInline
          ouiaId="project-manual-subform-alert"
        >
          {i18n._(msg`
            There are no available playbook directories in ${project_base_dir}.
            Either that directory is empty, or all of the contents are already
            assigned to other projects. Create a new directory there and make
            sure the playbook files can be read by the "awx" system user,
            or have ${brandName} directly retrieve your playbooks from
            source control using the Source Control Type option above.`)}
        </Alert>
      )}
      <FormField
        id="project-base-dir"
        label={i18n._(msg`Project Base Path`)}
        name="base_dir"
        type="text"
        isReadOnly
        tooltip={projectHelpStrings.projectBasePath(brandName)}
      />
      <FormGroup
        fieldId="project-local-path"
        helperTextInvalid={pathMeta.error}
        isRequired
        validated={!pathMeta.touched || !pathMeta.error ? 'default' : 'error'}
        label={i18n._(msg`Playbook Directory`)}
        labelIcon={<Popover content={projectHelpStrings.projectLocalPath} />}
      >
        <AnsibleSelect
          {...pathField}
          id="local_path"
          data={options}
          onChange={(event, value) => {
            pathHelpers.setValue(value);
          }}
        />
      </FormGroup>
    </>
  );
};

export default ManualSubForm;
