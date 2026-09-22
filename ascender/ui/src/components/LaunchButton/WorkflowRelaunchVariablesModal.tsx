import React, { useCallback, useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  Button,
  Content,
  ContentVariants,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';

import { WorkflowJobsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { isJsonString, jsonToYaml, parseVariableField } from 'util/yaml';
import CodeEditor from '../CodeEditor';
import ContentError from '../ContentError';
import ContentLoading from '../ContentLoading';

/**
 * The run's variables as the editor should open them: the api stores them as
 * JSON, and every other variables editor in the UI opens on YAML.
 */
function asYaml(extraVars?: string | null) {
  if (!extraVars || !extraVars.trim()) {
    return '---\n';
  }
  try {
    return isJsonString(extraVars) ? jsonToYaml(extraVars) : extraVars;
  } catch {
    // Not something we can reshape: show it as it came rather than lose it.
    return extraVars;
  }
}

export interface WorkflowRelaunchVariablesModalProps {
  /** The workflow job being relaunched, read for the variables it ran with. */
  jobId: number;
  /** Given the variables to relaunch with, already parsed out of the editor. */
  onConfirm: (extraVars: Record<string, unknown>) => void;
  onCancel: () => void;
  /** Whether the run being relaunched was canceled rather than failed. */
  isCanceled?: boolean;
}

/**
 * Asks which variables the relaunch should run with.
 *
 * The editor opens on the variables of the run being relaunched, so a value an
 * earlier node got wrong can be corrected in place. What comes back replaces
 * those variables key by key: a key left alone keeps what the original run
 * used, and a key that run never had is added.
 */
function WorkflowRelaunchVariablesModal({
  jobId,
  onConfirm,
  onCancel,
  isCanceled = false,
}: WorkflowRelaunchVariablesModalProps) {
  const { t } = useLingui();
  const [value, setValue] = useState('---\n');
  const [parseError, setParseError] = useState<string | null>(null);

  const {
    result: extraVars,
    request: fetchExtraVars,
    isLoading,
    error,
  } = useRequest(
    useCallback(async () => {
      const { data } = await WorkflowJobsAPI.readDetail(jobId);
      return data.extra_vars ?? '';
    }, [jobId]),
    ''
  );

  useEffect(() => {
    fetchExtraVars();
  }, [fetchExtraVars]);

  useEffect(() => {
    setValue(asYaml(extraVars));
  }, [extraVars]);

  const handleConfirm = () => {
    let parsed;
    try {
      parsed = parseVariableField(value);
    } catch (err) {
      setParseError((err as Error).message);
      return;
    }
    setParseError(null);
    onConfirm(parsed);
  };

  const title = isCanceled
    ? t`Relaunch from canceled node with new variables`
    : t`Relaunch from failed node with new variables`;

  return (
    <Modal
      isOpen
      variant="medium"
      title={title}
      aria-label={title}
      onClose={onCancel}
      ouiaId="relaunch-variables-modal"
      actions={[
        <Button
          key="relaunch"
          variant="primary"
          aria-label={t`Relaunch`}
          ouiaId="relaunch-variables-confirm"
          isDisabled={isLoading || Boolean(error)}
          onClick={handleConfirm}
        >
          {t`Relaunch`}
        </Button>,
        <Button
          key="cancel"
          variant="link"
          aria-label={t`Cancel`}
          ouiaId="relaunch-variables-cancel"
          onClick={onCancel}
        >
          {t`Cancel`}
        </Button>,
      ]}
    >
      {isLoading && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
      {!isLoading && !error && (
        <Form>
          <Content component={ContentVariants.p}>
            {t`These are the variables the workflow ran with. Whatever is left here replaces them for the nodes that run again; nodes carried forward keep the results they already had.`}
          </Content>
          <FormGroup fieldId="relaunch-variables" label={t`Variables`}>
            <CodeEditor
              id="relaunch-variables"
              mode="yaml"
              value={value}
              onChange={setValue}
              hasErrors={Boolean(parseError)}
              rows="auto"
              minRows={6}
            />
            {parseError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{parseError}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </Form>
      )}
    </Modal>
  );
}

export default WorkflowRelaunchVariablesModal;
