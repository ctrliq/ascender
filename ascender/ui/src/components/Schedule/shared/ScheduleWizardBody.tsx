import type {
  Label,
  LaunchCredential,
  NodeTemplate,
  Schedule,
  SummaryFieldRef,
} from 'types/api';
import React, { useMemo } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Divider, Form, Title } from '@patternfly/react-core';
import type { LegacyStepRef, LegacyWizardStep } from 'components/Wizard/Wizard';
import type { LaunchConfig, SurveyConfig } from 'components/LaunchPrompt/types';
import Wizard from 'components/Wizard';
import { useFormContext } from 'components/Form';
import ContentError from '../../ContentError';
import ContentLoading from '../../ContentLoading';
import FormSubmitError from '../../FormField/FormSubmitError';
import { FormColumnLayout } from '../../FormLayout';
import ScheduleFormFields from './ScheduleFormFields';
import ScheduleSummary from './ScheduleSummary';
import useSchedulePromptSteps from './useSchedulePromptSteps';
import type { ScheduleFormValues } from './types';
import './ScheduleWizardBody.css';

/** What a template prompts for, which becomes the steps after the schedule. */
export interface SchedulePromptConfig {
  launchConfig: LaunchConfig;
  surveyConfig?: SurveyConfig | null;
  schedule: Schedule;
  resource: NodeTemplate;
  credentials: LaunchCredential[];
  resourceDefaultCredentials?: LaunchCredential[] | null;
  labels: Label[];
  instanceGroups: SummaryFieldRef[];
}

export interface ScheduleWizardBodyProps {
  /** A step of the caller's own, ahead of the schedule: which resource. */
  firstStep?: LegacyWizardStep;
  title: React.ReactNode;
  /** Goes on the modal the wizard opens in, for the caller's own styling. */
  className?: string;
  /** The step to open on, one based, as the wizard counts them. */
  startIndex?: number;
  hasDaysToKeepField?: boolean;
  /**
   * True while what the schedule step is built from is still being read: the
   * step shows a spinner in place of its fields, inside the same modal, so the
   * wizard stays on screen rather than giving way to a page spinner.
   */
  isLoading?: boolean;
  zoneOptions?: { value: string; key: string; label: string }[];
  zoneLinks?: Record<string, string>;
  isSaveDisabled?: boolean;
  submitError?: unknown;
  /**
   * What the resource prompts for, where it prompts at all. Its steps follow
   * the schedule's own, and the last of them is the one that saves.
   */
  prompts?: SchedulePromptConfig | null;
  onClose: () => void;
  onSave: () => void;
}

/** The steps the wizard gets on top of the caller's and the schedule's. */
interface PromptSteps {
  steps: LegacyWizardStep[];
  onNext?: (current: LegacyStepRef, previous: LegacyStepRef) => void;
  onBack?: (current: LegacyStepRef, previous: LegacyStepRef) => void;
  onGoToStep?: (current: LegacyStepRef, previous: LegacyStepRef) => void;
}

interface ScheduleWizardProps extends Omit<ScheduleWizardBodyProps, 'prompts'> {
  promptSteps?: PromptSteps;
}

/**
 * The wizard itself: the caller's step, the schedule's fields, then whatever
 * the resource prompts for.
 */
function ScheduleWizard({
  firstStep,
  title,
  className,
  startIndex,
  hasDaysToKeepField,
  isLoading = false,
  zoneOptions = [],
  zoneLinks = {},
  isSaveDisabled = false,
  submitError,
  promptSteps,
  onClose,
  onSave,
}: ScheduleWizardProps) {
  const { t } = useLingui();
  const hasPromptSteps = Boolean(promptSteps?.steps.length);
  return (
    <Wizard
      isOpen
      className={className}
      title={title}
      startIndex={startIndex}
      onClose={onClose}
      onSave={onSave}
      onNext={promptSteps?.onNext}
      onBack={promptSteps?.onBack}
      onGoToStep={promptSteps?.onGoToStep}
      steps={[
        ...(firstStep ? [firstStep] : []),
        {
          id: 'schedule',
          name: t`Schedule`,
          /*
           * Inside a Form, as every other wizard's fields are: the form is what
           * defines the gap the column layout puts between its fields, and
           * without it they sit flush against each other.
           */
          component: isLoading ? (
            <ContentLoading />
          ) : (
            <Form autoComplete="off" className="ascender-schedule-wizard__form">
              <FormColumnLayout>
                <ScheduleFormFields
                  hasDaysToKeepField={hasDaysToKeepField}
                  zoneOptions={zoneOptions}
                  zoneLinks={zoneLinks}
                />
                <FormSubmitError error={submitError} />
              </FormColumnLayout>
            </Form>
          ),
          /*
           * With prompts after it, this step only leads on to them, and the
           * preview at the end is what saves. Without them it saves itself.
           */
          ...(hasPromptSteps
            ? { enableNext: !isLoading }
            : {
                enableNext: !isLoading && !isSaveDisabled,
                nextButtonText: t`Save`,
              }),
        },
        ...(promptSteps?.steps ?? []),
      ]}
      backButtonText={t`Back`}
      cancelButtonText={t`Cancel`}
      nextButtonText={t`Next`}
    />
  );
}

/**
 * The wizard with the resource's prompts as steps of its own.
 *
 * The steps come from the same hook the launch prompt builds its own from,
 * which reads and resets the form, so this sits inside the form the schedule
 * step's fields belong to, and the two share their values.
 */
function PromptingScheduleWizard({
  prompts,
  submitError,
  ...rest
}: ScheduleWizardProps & { prompts: SchedulePromptConfig }) {
  const { t } = useLingui();
  const { setFieldTouched } = useFormContext<ScheduleFormValues>();
  /*
   * An empty survey where the template has none, and the same one for as long
   * as the wizard is open. The hook seeds the prompted fields only once it has
   * a survey config, so without one Job Type opened blank; and it seeds them
   * again whenever the config changes, so a new object every render would
   * reset the form every render.
   */
  const surveyConfig = useMemo(
    () => prompts.surveyConfig ?? ({} as SurveyConfig),
    [prompts.surveyConfig]
  );
  const {
    steps,
    isReady,
    visitStep,
    visitAllSteps,
    validateStep,
    contentError,
  } = useSchedulePromptSteps(
    surveyConfig,
    prompts.launchConfig,
    prompts.schedule,
    prompts.resource,
    prompts.credentials,
    prompts.resourceDefaultCredentials,
    prompts.labels,
    prompts.instanceGroups
  );

  /* Leaving a step marks it visited, so its errors show; reaching the
     preview visits them all, since the preview is what saves. */
  const visit = (current: LegacyStepRef, previous: LegacyStepRef) => {
    if (current.id === 'preview') {
      visitAllSteps(setFieldTouched);
    } else {
      visitStep(previous.prevId as string, setFieldTouched);
      validateStep(current.id as string);
    }
  };

  let promptSteps: LegacyWizardStep[] = steps as LegacyWizardStep[];
  if (contentError) {
    promptSteps = [
      {
        id: 'prompts-error',
        name: t`Error`,
        component: <ContentError error={contentError} />,
        enableNext: false,
      },
    ];
  } else if (!isReady) {
    promptSteps = [
      {
        id: 'prompts-loading',
        name: t`Content Loading`,
        component: <ContentLoading />,
        enableNext: false,
      },
    ];
  }

  return (
    <ScheduleWizard
      {...rest}
      submitError={null}
      promptSteps={{
        /*
         * The preview opens on the schedule, the part this wizard adds, above
         * what the template will run with; a failed save is said under both,
         * since Save is the preview's button.
         */
        steps: promptSteps.map((step) =>
          step.id === 'preview'
            ? {
                ...step,
                component: (
                  <>
                    {/* Two lists with a Name each, so each says whose it is,
                        headed the way the preview's Prompted Values is. */}
                    <Title
                      headingLevel="h2"
                      className="ascender-prompt-detail__title ascender-schedule-wizard__preview-title"
                    >
                      {t`Schedule`}
                    </Title>
                    <Divider className="ascender-prompt-detail__divider" />
                    <ScheduleSummary />
                    <Title
                      headingLevel="h2"
                      className="ascender-prompt-detail__title"
                    >
                      {t`Template`}
                    </Title>
                    <Divider className="ascender-prompt-detail__divider" />
                    {step.component}
                    <FormSubmitError error={submitError} />
                  </>
                ),
              }
            : step
        ),
        onNext: visit,
        onGoToStep: visit,
        onBack: (current) => {
          validateStep(current.id as string);
        },
      }}
    />
  );
}

/**
 * The schedule form as a wizard, for a caller that has steps of its own.
 *
 * The schedule's own fields are one step, behind whatever the caller puts
 * ahead of them. What the resource prompts for follows as steps of the same
 * wizard, the way the run wizard asks them, ending on a preview that saves.
 */
function ScheduleWizardBody({ prompts, ...rest }: ScheduleWizardBodyProps) {
  return prompts && !rest.isLoading ? (
    <PromptingScheduleWizard {...rest} prompts={prompts} />
  ) : (
    <ScheduleWizard {...rest} />
  );
}

export default ScheduleWizardBody;
