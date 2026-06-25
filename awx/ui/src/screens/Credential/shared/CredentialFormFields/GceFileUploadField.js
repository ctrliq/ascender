import React, { useState } from 'react';
import { useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';

import {
  FileUpload,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';

function GceFileUploadField() {
  const { t } = useLingui();
  const { setFieldValue } = useFormikContext();
  const [fileError, setFileError] = useState(null);
  const [filename, setFilename] = useState('');
  const [fileValue, setFileValue] = useState('');

  const populateFields = (jsonStr) => {
    try {
      const json = JSON.parse(jsonStr);
      setFieldValue('inputs.username', json.client_email || '');
      setFieldValue('inputs.project', json.project_id || '');
      setFieldValue('inputs.ssh_key_data', json.private_key || '');
      setFileError(null);
    } catch {
      setFileError(t`There was an error parsing the file. Please check the file formatting and try again.`);
    }
  };

  const clearFields = () => {
    setFieldValue('inputs.username', '');
    setFieldValue('inputs.project', '');
    setFieldValue('inputs.ssh_key_data', '');
  };

  return (
    <FormGroup
      fieldId="credential-gce-file"
      label={t`Service account JSON file`}
    >
      <FileUpload
        id="credential-gce-file"
        type="text"
        value={fileValue}
        filename={filename}
        filenamePlaceholder={t`Choose a .json file`}
        browseButtonText={t`Browse…`}
        clearButtonText={t`Clear`}
        onFileInputChange={(_event, file) => {
          setFilename(file.name);
          setFileError(null);
        }}
        onDataChange={(_event, data) => {
          setFileValue(data);
          populateFields(data);
        }}
        onClearClick={() => {
          setFilename('');
          setFileValue('');
          clearFields();
        }}
        dropzoneProps={{
          accept: { 'application/json': ['.json'] },
          onDropRejected: () => {
            setFileError(
              t`File upload rejected. Please select a single .json file.`
            );
          },
        }}
      />
      <FormHelperText>
        <HelperText>
          <HelperTextItem variant={fileError ? 'error' : 'default'}>
            {fileError ||
              t`Select a JSON formatted service account key to autopopulate the following fields.`}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  );
}

export default GceFileUploadField;
