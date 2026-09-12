import type {
  WorkflowAction,
  WorkflowState,
} from 'components/Workflow/workflowReducer';
import type {
  Credential,
  Label,
  LaunchConfig,
  LaunchCredential,
  SummaryFieldRef,
  SurveyConfig,
} from 'types/api';
/* eslint-disable react/jsx-no-useless-fragment */
import React, { useContext, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Formik, useFormikContext } from 'formik';
import * as yaml from 'js-yaml';
import {
  Button,
  Form,
  WizardFooterWrapper,
  useWizardContext,
} from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';

import useRequest, { useDismissableError } from 'hooks/useRequest';
import mergeExtraVars from 'util/prompt/mergeExtraVars';
import getSurveyValues from 'util/prompt/getSurveyValues';
import { parseVariableField } from 'util/yaml';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import Wizard from 'components/Wizard';
import AlertModal from 'components/AlertModal';
import useWorkflowNodeSteps from './useWorkflowNodeSteps';
import type { NodeModalValues } from './useWorkflowNodeSteps';
import NodeNextButton from './NodeNextButton';
import type { NodeWizardStep } from './NodeNextButton';

export interface NodeModalCustomFooterProps {
  promptSteps: NodeWizardStep[];
  isLaunchLoading: boolean;
  /** Counts up to tell the next button to move the wizard on. */
  triggerNext: number;
  setTriggerNext: React.Dispatch<React.SetStateAction<number>>;
  handleCancel: () => void;
  /** Says Save on the last step and Next everywhere else. */
  nextButtonText: (activeStep: NodeWizardStep | null) => string;
  [key: string]: unknown;
}

function NodeModalCustomFooter({
  promptSteps,
  isLaunchLoading,
  triggerNext,
  setTriggerNext,
  handleCancel,
  nextButtonText,
}: NodeModalCustomFooterProps) {
  const { t } = useLingui();
  const { activeStep, goToNextStep, goToPrevStep } = useWizardContext();

  // Look up the original step data to get enableNext (not part of PF5 step type)
  const originalStep = promptSteps.find((s) => s.id === activeStep?.id);
  const stepWithEnableNext = {
    ...activeStep,
    enableNext: originalStep?.enableNext !== false,
  };

  return (
    <WizardFooterWrapper>
      <NodeNextButton
        isDisabled={isLaunchLoading}
        triggerNext={triggerNext}
        activeStep={stepWithEnableNext}
        aria-label={nextButtonText(activeStep)}
        onNext={goToNextStep}
        onClick={() => setTriggerNext(triggerNext + 1)}
        buttonText={nextButtonText(activeStep)}
      />
      {activeStep && activeStep.id !== promptSteps[0]?.id && (
        <Button
          ouiaId="node-modal-back-button"
          id="back-node-modal"
          variant="secondary"
          aria-label={t`Back`}
          onClick={goToPrevStep}
        >
          {t`Back`}
        </Button>
      )}
      <Button
        ouiaId="node-modal-cancel-button"
        id="cancel-node-modal"
        variant="link"
        aria-label={t`Cancel`}
        onClick={handleCancel}
      >
        {t`Cancel`}
      </Button>
    </WizardFooterWrapper>
  );
}

export interface NodeModalFormProps {
  askLinkType: boolean;
  onSave: (values: NodeModalValues, config: LaunchConfig) => void;
  title: React.ReactNode;
  credentialError?: unknown;
  launchConfig: LaunchConfig;
  surveyConfig: SurveyConfig;
  isLaunchLoading: boolean;
  resourceDefaultCredentials: LaunchCredential[] | null;
  labels: SummaryFieldRef[];
  instanceGroups: SummaryFieldRef[];
}

function NodeModalForm({
  askLinkType,
  onSave,
  title,
  credentialError,
  launchConfig,
  surveyConfig,
  isLaunchLoading,
  resourceDefaultCredentials,
  labels,
  instanceGroups,
}: NodeModalFormProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  const { values, setFieldTouched } = useFormikContext<NodeModalValues>();
  const { t } = useLingui();

  const [triggerNext, setTriggerNext] = useState(0);

  const clearQueryParams = () => {
    const parts = location.search.replace(/^\?/, '').split('&');
    const otherParts = parts.filter((param) =>
      /^!(job_templates\.|projects\.|inventory_sources\.|workflow_job_templates\.)/.test(
        param
      )
    );
    navigate(`${location.pathname}?${otherParts.join('&')}`, { replace: true });
  };

  const {
    steps: promptSteps,
    validateStep,
    visitStep,
    visitAllSteps,
    contentError,
  } = useWorkflowNodeSteps(
    launchConfig,
    surveyConfig,
    values.nodeResource ?? null,
    askLinkType,
    resourceDefaultCredentials,
    labels,
    instanceGroups
  );

  const handleSaveNode = () => {
    clearQueryParams();
    if (values.nodeType !== 'workflow_approval_template') {
      delete values.approvalName;
      delete values.approvalDescription;
      delete values.timeoutMinutes;
      delete values.timeoutSeconds;
      delete values.contextTemplate;
      delete values.requiredApprovals;
      delete values.onTimeout;
    }

    if (
      ['job_template', 'workflow_job_template'].includes(
        values.nodeType ?? ''
      ) &&
      (launchConfig.ask_variables_on_launch || launchConfig.survey_enabled)
    ) {
      let extraVars;
      const surveyValues = getSurveyValues(values);
      const initialExtraVars = launchConfig.ask_variables_on_launch
        ? values.extra_vars || '---'
        : undefined;
      if (surveyConfig?.spec) {
        extraVars = yaml.dump(mergeExtraVars(initialExtraVars, surveyValues));
      } else {
        extraVars = yaml.dump(mergeExtraVars(initialExtraVars, {}));
      }
      values.extra_data = extraVars ? parseVariableField(extraVars) : {};
      delete values.extra_vars;
    } else if (
      values.nodeType === 'system_job_template' &&
      ['cleanup_activitystream', 'cleanup_jobs'].includes(
        values?.nodeResource?.job_type ?? ''
      )
    ) {
      values.extra_data = {
        days: parseInt(String(values?.daysToKeep), 10),
      };
    }

    delete values.daysToKeep;
    onSave(values, launchConfig);
  };

  const handleCancel = () => {
    clearQueryParams();
    dispatch({ type: 'CANCEL_NODE_MODAL' });
  };

  const { error, dismissError } = useDismissableError(
    contentError || credentialError
  );

  const getNextButtonText = useCallback(
    (activeStep: NodeWizardStep | null) => {
      let verifyPromptSteps = false;
      if (promptSteps.length) {
        verifyPromptSteps =
          activeStep?.id === promptSteps[promptSteps.length - 1]?.id;
      }
      return verifyPromptSteps || activeStep?.name === 'Preview'
        ? t`Save`
        : t`Next`;
    },
    [promptSteps, t]
  );

  if (error) {
    return (
      <AlertModal
        isOpen={error}
        variant="error"
        title={t`Error!`}
        onClose={() => {
          dismissError();
        }}
      >
        <ContentError error={error} />
      </AlertModal>
    );
  }

  if (error && !isLaunchLoading) {
    return (
      <AlertModal
        isOpen={error}
        variant="error"
        title={t`Error!`}
        onClose={() => {
          dismissError();
        }}
      >
        <ContentError error={error} />
      </AlertModal>
    );
  }
  return (
    <Wizard
      footer={
        <NodeModalCustomFooter
          promptSteps={promptSteps}
          isLaunchLoading={isLaunchLoading}
          triggerNext={triggerNext}
          setTriggerNext={setTriggerNext}
          handleCancel={handleCancel}
          nextButtonText={getNextButtonText}
        />
      }
      isOpen={!error}
      onClose={handleCancel}
      onSave={() => {
        handleSaveNode();
      }}
      onBack={async (nextStep) => {
        validateStep(nextStep.id as string);
      }}
      onGoToStep={async (nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId as string, setFieldTouched);
          validateStep(nextStep.id as string);
        }
      }}
      steps={promptSteps}
      css="overflow: scroll"
      title={title}
      onNext={async (nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId as string, setFieldTouched);
          validateStep(nextStep.id as string);
        }
      }}
    />
  );
}

export interface NodeModalInnerProps {
  title: React.ReactNode;
  onSave: (values: NodeModalValues, config: LaunchConfig) => void;
  askLinkType: boolean;
}

const NodeModalInner = ({
  title,
  onSave,
  askLinkType,
}: NodeModalInnerProps) => {
  const { values } = useFormikContext<NodeModalValues>();
  const { t } = useLingui();

  const wizardTitle = values.nodeResource
    ? `${title} | ${values.nodeResource.name}`
    : title;

  const {
    request: readLaunchConfigs,
    error: launchConfigError,
    result: { launchConfig, surveyConfig, resourceDefaultCredentials, labels },
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const readLaunch = (type: string | undefined, id: number) =>
        type === 'workflow_job_template'
          ? WorkflowJobTemplatesAPI.readLaunch(id)
          : JobTemplatesAPI.readLaunch(id);
      // Read off values once: the checks below are what say the resource is a
      // template with an id, which is what the requests are addressed by.
      const nodeResource = values.nodeResource;
      if (
        !nodeResource?.id ||
        !['job_template', 'workflow_job_template'].includes(
          values?.nodeType ?? ''
        ) ||
        !['job_template', 'workflow_job_template'].includes(
          nodeResource.type ?? ''
        )
      ) {
        return {
          launchConfig: {},
          surveyConfig: {},
          resourceDefaultCredentials: [],
          labels: [],
        };
      }

      const readLabels =
        values.nodeType === 'workflow_job_template'
          ? WorkflowJobTemplatesAPI.readAllLabels(nodeResource.id)
          : JobTemplatesAPI.readAllLabels(nodeResource.id);

      const { data: launch } = await readLaunch(
        values.nodeType,
        nodeResource.id
      );

      let survey: SurveyConfig = {};

      if (launch.survey_enabled) {
        const { data } = launch?.workflow_job_template_data
          ? await WorkflowJobTemplatesAPI.readSurvey(
              launch.workflow_job_template_data.id as number
            )
          : await JobTemplatesAPI.readSurvey(
              launch?.job_template_data?.id as number
            );

        survey = data;
      }

      let defaultCredentials: Credential[] = [];

      if (launch.ask_credential_on_launch) {
        const {
          data: { results },
        } = await JobTemplatesAPI.readCredentials(nodeResource.id, {
          page_size: 200,
        });
        defaultCredentials = results;
      }

      let defaultLabels: Label[] = [];

      if (launch.ask_labels_on_launch) {
        const {
          data: { results },
        } = await readLabels;

        defaultLabels = results;
      }

      return {
        launchConfig: launch,
        surveyConfig: survey,
        resourceDefaultCredentials: defaultCredentials,
        labels: defaultLabels,
      };
    }, [values.nodeResource, values.nodeType]),
    {
      launchConfig: null,
      surveyConfig: {},
      resourceDefaultCredentials: null,
      labels: [],
    }
  );

  useEffect(() => {
    readLaunchConfigs();
  }, [readLaunchConfigs, values.nodeResource]);

  const { error, dismissError } = useDismissableError(launchConfigError);

  if (error) {
    return (
      <AlertModal
        isOpen={error}
        variant="error"
        title={t`Error!`}
        onClose={() => {
          dismissError();
        }}
      >
        <ContentError error={error} />
      </AlertModal>
    );
  }

  if (!launchConfig || !surveyConfig) {
    return (
      <Wizard
        isOpen
        steps={[
          {
            name: t`Loading`,
            component: <ContentLoading />,
          },
        ]}
        title={wizardTitle}
        footer={<></>}
      />
    );
  }

  return (
    <NodeModalForm
      onSave={onSave}
      askLinkType={askLinkType}
      launchConfig={launchConfig}
      surveyConfig={surveyConfig}
      resourceDefaultCredentials={resourceDefaultCredentials}
      isLaunchLoading={isLoading}
      title={wizardTitle}
      labels={labels}
      instanceGroups={[]}
    />
  );
};

export interface NodeModalProps {
  onSave: (values: NodeModalValues, config: LaunchConfig) => void;
  askLinkType: boolean;
  title: React.ReactNode;
}

const NodeModal = ({ onSave, askLinkType, title }: NodeModalProps) => {
  const { nodeToEdit } = useContext(WorkflowStateContext) as WorkflowState;
  const onSaveForm = (values: NodeModalValues, config: LaunchConfig) => {
    onSave(values, config);
  };

  return (
    <Formik
      initialValues={{
        approvalName: '',
        approvalDescription: '',
        contextTemplate: '',
        requiredApprovals: 1,
        onTimeout: 'deny',
        daysToKeep: 30,
        identifier: nodeToEdit?.identifier || '',
        timeoutMinutes: 0,
        timeoutSeconds: 0,
        convergence: 'any',
        maxRetries: nodeToEdit?.max_retries || 0,
        linkType: 'success',
        linkConditionTrigger: 'success',
        linkConditionArtifactKey: '',
        linkConditionOperator: 'eq',
        linkConditionExpectedValue: '',
        nodeResource: nodeToEdit?.fullUnifiedJobTemplate || null,
        nodeType: nodeToEdit?.fullUnifiedJobTemplate?.type || 'job_template',
      }}
      // The wizard's own footer saves through onSave below; this prop was
      // named onSave too, which Formik does not have, so nothing here ever
      // submitted.
      onSubmit={() => {}}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <NodeModalInner
            onSave={onSaveForm}
            title={title}
            askLinkType={askLinkType}
          />
        </Form>
      )}
    </Formik>
  );
};

export default NodeModal;
