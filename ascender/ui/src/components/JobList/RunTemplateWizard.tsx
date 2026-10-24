import type {
  AnyJob,
  AnyUnifiedJobTemplate,
  ApiResponse,
  LaunchableResource,
} from 'types/api';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import { FormRoot, useFormContext } from 'components/Form';
import Wizard from 'components/Wizard';
import ContentLoading from 'components/ContentLoading';
import ContentError from 'components/ContentError';
import AlertModal from 'components/AlertModal';
import useLaunchSteps from 'components/LaunchPrompt/useLaunchSteps';
import buildLaunchParams from 'components/LaunchPrompt/buildLaunchParams';
import readLaunchPrompts, {
  NO_LAUNCH_PROMPTS,
} from 'components/LaunchPrompt/readLaunchPrompts';
import type { LaunchPrompts } from 'components/LaunchPrompt/readLaunchPrompts';
import type {
  LaunchConfig,
  LaunchPromptValues,
  SurveyConfig,
} from 'components/LaunchPrompt/types';
import { JOB_TYPE_URL_SEGMENTS } from '../../constants';
import RunTemplateStep from './RunTemplateStep';
import RunTargetStep from './RunTargetStep';
import type { RunTarget, TargetKind } from './RunTargetStep';
import {
  NOT_STARTED_STATE,
  NotStartedDetail,
  startEach,
  toNavigationState,
} from './notStarted';
import type { NotStarted } from './notStarted';

/** What a template asks for, which is what the steps after the first are built from. */
type TemplatePrompts = LaunchPrompts;

/** Prompts as read, with the template and the read they came from. */
interface LoadedPrompts extends TemplatePrompts {
  templateId?: number;
  thisRead?: number;
}

/*
 * The patterns that name every host there is, which the ad hoc command's own
 * help says in as many words: all, *, and nothing at all. A limit of one of
 * these leaves the run where it would have been, so it is neither a reason to
 * hide a template that ignores limits nor something to announce as a
 * restriction; it still seeds the field, so the reader sees what will run.
 */
const EVERY_HOST = ['', 'all', '*'];

const NOT_LOADED: LoadedPrompts = NO_LAUNCH_PROMPTS;

interface RunWizardFormProps extends TemplatePrompts {
  template: AnyUnifiedJobTemplate | null;
  /** The inventories to run in, where the caller picked more than one. */
  inventoryIds?: number[];
  /** Those inventories by name, in the same order, for naming a refusal. */
  inventoryNames?: string[];
  /** Only this kind of template, where the caller offers one kind at a time. */
  templateType?: string;
  /** The host pattern the run is limited to, where the caller has one. */
  limit?: string;
  /** The inventory those hosts are in, which the run uses rather than asking. */
  inventoryId?: number | null;
  /** Where nothing said what to run on, the wizard asks that first. */
  asksForTarget?: boolean;
  target?: RunTarget | null;
  onChangeTarget?: (target: RunTarget | null) => void;
  onSelectTemplate: (template: AnyUnifiedJobTemplate | null) => void;
  onClose: () => void;
  isLoadingPrompts: boolean;
  error: unknown;
  onError: (error: unknown) => void;
}

/**
 * The prompt wizard, with the template to run as its first step.
 *
 * Launching from a template's own row knows what it is launching; here the
 * template is the first thing asked for, and everything the template prompts
 * for follows it. The prompts are read before this mounts, because the steps
 * take their initial values from them as they are built.
 */
function RunWizardForm({
  template,
  templateType,
  limit,
  inventoryId,
  inventoryIds,
  inventoryNames,
  asksForTarget,
  target,
  onChangeTarget,
  onSelectTemplate,
  onClose,
  launchConfig,
  surveyConfig,
  labels,
  credentials,
  isLoadingPrompts,
  error,
  onError,
}: RunWizardFormProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { setFieldTouched, setFieldValue, values } =
    useFormContext<LaunchPromptValues>();
  /* Hosts from two inventories are not one run, which is the one way the
     step can be answered with something it cannot hand on. */
  const [isTargetValid, setIsTargetValid] = useState(true);
  /* Several runs asked for and every one of them refused: nothing to move
     on to, so they are named here. */
  const [refusedAll, setRefusedAll] = useState<NotStarted[]>([]);
  const isWorkflow = template?.type === 'workflow_job_template';
  /*
   * The limit seeds the field the template prompts with, so the run is the
   * caller's hosts rather than the template's own pattern. A template that
   * does not prompt for one has no field to seed and no limit to send: it
   * runs on its whole inventory, and where the limit rules hosts out such a
   * template is not offered at all.
   */
  const resource = {
    ...(template ?? {}),
    ...(limit ? { limit } : {}),
  } as LaunchableResource;
  /*
   * The title says which run this is where the caller offers one kind at a
   * time, as the runs list does, and stays general where the wizard is opened
   * on both kinds at once.
   */
  const title =
    {
      job_template: t`Run Job`,
      workflow_job_template: t`Run Workflow`,
    }[templateType ?? ''] ?? t`Run Template`;
  /** A limit that rules some hosts out, rather than one naming them all. */
  const narrowsTheRun = Boolean(limit) && !EVERY_HOST.includes(limit as string);
  /*
   * What the header says the run is aimed at: the field the template prompts
   * with once there is one, so an edit to it shows, and the caller's own
   * pattern before then. A blank field is every host, and says so.
   */
  const shownLimit = (values.limit ?? limit ?? '').trim() || 'all';
  /*
   * Where the caller named the inventory, the wizard does not ask for one: the
   * hosts it is limited to are in that inventory and nowhere else, so the step
   * would only offer a way to point the run somewhere the limit means nothing.
   */
  const asksForInventory = Boolean(launchConfig?.ask_inventory_on_launch);
  const asksForLimit = Boolean(launchConfig?.ask_limit_on_launch);
  /*
   * What the template lets the run be aimed at, which is what the step after
   * it offers: an inventory where the template prompts for one, hosts and
   * groups where it prompts for a limit. A template that prompts for neither
   * runs on its own inventory whole, so there is nothing to ask and no step.
   */
  const targetKinds: TargetKind[] = [
    ...(asksForInventory ? (['inventory'] as TargetKind[]) : []),
    ...(asksForLimit ? (['group', 'host'] as TargetKind[]) : []),
  ];
  /* The inventory the template is stuck with, which is where its run happens
     whatever is ticked, so it is the one the hosts offered come from. */
  const fixedInventoryId = asksForInventory
    ? null
    : ((template as { inventory?: number } | null)?.inventory ?? null);
  const asksWhereToRun = Boolean(
    asksForTarget && template && launchConfig && targetKinds.length
  );
  /* One inventory or several, as one list: a caller that named one is a list
     of one, and the launch below runs the template once in each. */
  const inventories = inventoryIds?.length
    ? inventoryIds
    : [inventoryId].filter((id): id is number => typeof id === 'number');
  /*
   * The step that asks where the run goes is the inventory question, so the
   * prompt that would ask it again is dropped: where a caller named the
   * inventories, and where the step after the template offers them.
   */
  const stepConfig =
    (inventories.length || asksWhereToRun) && launchConfig
      ? { ...launchConfig, ask_inventory_on_launch: false }
      : launchConfig;

  const {
    steps,
    isReady,
    validateStep,
    visitStep,
    visitAllSteps,
    contentError,
  } = useLaunchSteps(
    (stepConfig ?? {}) as LaunchConfig,
    (surveyConfig ?? {}) as SurveyConfig,
    resource,
    labels,
    [],
    credentials
  );

  const handleSave = async () => {
    try {
      const params = await buildLaunchParams(
        values,
        launchConfig as LaunchConfig,
        resource
      );
      const launch = (inventory?: number) => {
        // The step that would have collected this is not shown, and the api
        // takes an inventory only from a template that asks for one.
        const body =
          inventory && asksForInventory
            ? { ...params, inventory_id: inventory }
            : params;
        const launched: Promise<ApiResponse<AnyJob>> = isWorkflow
          ? WorkflowJobTemplatesAPI.launch(template?.id as number, body)
          : JobTemplatesAPI.launch(template?.id as number, body);
        return launched;
      };
      /*
       * Several inventories are several runs of the same template, started in
       * the order they were ticked. A template that does not ask for one runs
       * in its own inventory whatever was ticked, so it is one run rather than
       * identical copies of it.
       */
      const runs = asksForInventory ? inventories : inventories.slice(0, 1);
      if (runs.length < 2) {
        const { data: job } = await launch(runs[0]);
        onClose();
        const segment = JOB_TYPE_URL_SEGMENTS[job.type];
        navigate(
          segment
            ? `/runs/${segment}/${job.id}/output`
            : `/runs/${job.id}/output`
        );
        return;
      }
      /*
       * One refusal does not stop the others: each run is asked for whatever
       * happens to the rest, and the ones refused are named with the api's
       * reason. The list is where the ones that started are, and where the
       * refusals are said, since this wizard is gone by the time it shows.
       */
      const { started, refused } = await startEach(
        runs,
        launch,
        (inventory) =>
          inventoryNames?.[inventories.indexOf(inventory)] ?? `#${inventory}`
      );
      if (!started.length) {
        setRefusedAll(refused);
        return;
      }
      onClose();
      navigate(
        '/runs',
        refused.length
          ? { state: { [NOT_STARTED_STATE]: toNavigationState(refused) } }
          : undefined
      );
    } catch (err) {
      onError(err);
    }
  };

  if (refusedAll.length) {
    return (
      <AlertModal isOpen variant="error" title={t`Error!`} onClose={onClose}>
        {t`Not started: ${refusedAll.map(({ name }) => name).join(', ')}`}
        <NotStartedDetail refused={refusedAll} />
      </AlertModal>
    );
  }

  const raised = error || contentError;
  if (raised) {
    return (
      <AlertModal isOpen variant="error" title={t`Error!`} onClose={onClose}>
        <ContentError error={raised} />
      </AlertModal>
    );
  }

  /* The preview is the launch wizard's own: what the run is aimed at reads
     off the Limit it was given, which is a prompted value like the rest. */
  const promptSteps = template && launchConfig && isReady ? steps : [];
  const loadingStep = isLoadingPrompts
    ? [
        {
          id: 'loading',
          name: t`Content Loading`,
          component: <ContentLoading />,
        },
      ]
    : [];

  return (
    <Wizard
      isOpen
      onClose={onClose}
      onSave={handleSave}
      onBack={async (nextStep) => {
        validateStep(nextStep.id as string);
      }}
      onNext={async (nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId as string, setFieldTouched);
          validateStep(nextStep.id as string);
        }
      }}
      onGoToStep={async (nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId as string, setFieldTouched);
          validateStep(nextStep.id as string);
        }
      }}
      title={title}
      description={limit ? t`Limit: ${shownLimit}` : undefined}
      /*
       * Picking a template rebuilds the wizard around what it prompts for, so
       * it opens again, on the step after the template rather than on the
       * template that was just picked: where the run is aimed where the wizard
       * asks that, and the template's first prompt everywhere else.
       */
      startIndex={template ? 2 : 1}
      steps={[
        {
          id: 'template',
          name: t`Template`,
          component: (
            <RunTemplateStep
              template={template}
              templateType={templateType}
              /* Where the run is aimed comes after the template here, so the
                 list is everything the account may start; the callers that
                 arrive with hosts already in hand are the ones that narrow
                 it. */
              aimedAtInventoryIds={asksForTarget ? [] : inventories}
              onSelect={onSelectTemplate}
              /* A run aimed at hosts is only a run on those hosts where the
                 template takes the limit, so the rest are not offered. */
              mustAcceptLimit={asksForTarget ? false : narrowsTheRun}
            />
          ),
          enableNext: Boolean(template) && !isLoadingPrompts,
        },
        ...(asksWhereToRun
          ? [
              {
                id: 'target',
                name: t`Limit`,
                component: (
                  <RunTargetStep
                    value={target}
                    inventoryRole="use_role"
                    kinds={targetKinds}
                    withinInventoryId={fixedInventoryId}
                    onValidity={setIsTargetValid}
                    onChange={(next) => {
                      onChangeTarget?.(next);
                      /*
                       * The template's own Limit field is what carries the
                       * hosts to the api, and the steps holding it were built
                       * before this was ticked: setting it here is what keeps
                       * the two the same answer.
                       */
                      if (asksForLimit) {
                        setFieldValue('limit', next?.limit ?? '');
                      }
                    }}
                  />
                ),
                /*
                 * An inventory has to be picked where the template prompts
                 * for one, since the run happens in it. Where the template
                 * names its own, ticking nothing is a run on all of it.
                 */
                enableNext: asksForInventory ? Boolean(target) : isTargetValid,
              },
            ]
          : []),
        ...loadingStep,
        ...promptSteps,
      ]}
      backButtonText={t`Back`}
      cancelButtonText={t`Cancel`}
      nextButtonText={t`Next`}
    />
  );
}

export interface RunTemplateWizardProps {
  onClose: () => void;
  /**
   * True where nothing has said what the run is aimed at, as on the runs
   * list: the wizard asks for it in a step of its own before the template.
   */
  asksForTarget?: boolean;
  /** Hosts to limit the run to, as an Ansible pattern. */
  limit?: string;
  /** The inventory those hosts are in. */
  inventoryId?: number | null;
  /**
   * The inventories to run in, where the caller picked more than one: the
   * template is launched once in each, since a run happens in one.
   */
  inventoryIds?: number[];
  /** Only this kind of template, where the caller offers one kind at a time. */
  templateType?: string;
}

function RunTemplateWizard({
  onClose,
  asksForTarget,
  limit,
  inventoryId,
  inventoryIds,
  templateType,
}: RunTemplateWizardProps) {
  const [target, setTarget] = useState<RunTarget | null>(null);
  const [template, setTemplate] = useState<AnyUnifiedJobTemplate | null>(null);
  const [prompts, setPrompts] = useState<LoadedPrompts>(NOT_LOADED);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /*
   * Which read is the current one. Picking A and then B starts two reads, and
   * nothing says A answers first: a read that is no longer the latest drops
   * its answer, its error and its end of loading, so B never gets A's prompts
   * and A finishing does not clear the spinner B is still waiting behind.
   */
  const latestRead = useRef(0);

  /*
   * The reads the launch button makes, minus its shortcut for a template that
   * prompts for nothing: the wizard is already open, so that template simply
   * goes straight to its preview.
   */
  const readPrompts = useCallback(async (picked: AnyUnifiedJobTemplate) => {
    latestRead.current += 1;
    const thisRead = latestRead.current;
    const isCurrent = () => latestRead.current === thisRead;
    setIsLoadingPrompts(true);
    try {
      const read = await readLaunchPrompts({
        id: picked.id as number,
        type: picked.type,
      });
      if (isCurrent()) {
        setPrompts({ ...read, templateId: picked.id as number, thisRead });
      }
    } catch (err) {
      if (isCurrent()) {
        setError(err);
      }
    } finally {
      if (isCurrent()) {
        setIsLoadingPrompts(false);
      }
    }
  }, []);

  const handleSelectTemplate = (picked: AnyUnifiedJobTemplate | null) => {
    // Whatever was still being read is for the template given up.
    latestRead.current += 1;
    setIsLoadingPrompts(false);
    // What the last template could be aimed at says nothing about this one.
    setTarget(null);
    setTemplate(picked);
  };

  useEffect(() => {
    if (template) {
      readPrompts(template);
    }
  }, [template, readPrompts]);

  /*
   * Prompts only count for the template they were read for: between a pick
   * and its prompts arriving, the steps are the ones of a template that asks
   * for nothing yet, rather than the last template's.
   */
  const isForTemplate =
    Boolean(template) && prompts.templateId === (template?.id as number);
  const {
    templateId: _templateId,
    thisRead: _thisRead,
    ...shownPrompts
  } = isForTemplate ? prompts : NOT_LOADED;

  /*
   * Keyed on the read that filled the prompts, so the form is rebuilt once per
   * pick, when they arrive, from the real launch config: the steps take their
   * initial values as they are built, and a second template starts from
   * nothing rather than carrying the first one's answers into fields that
   * share a name. Until then the wizard stays as it is, on the template step,
   * rather than being rebuilt once for the pick and again for its prompts.
   */
  return (
    <FormRoot
      key={`prompts-${prompts.thisRead ?? 0}`}
      initialValues={{}}
      onSubmit={() => {}}
    >
      <RunWizardForm
        template={template}
        templateType={templateType}
        limit={asksForTarget ? target?.limit : limit}
        inventoryId={inventoryId}
        inventoryIds={asksForTarget ? target?.inventoryIds : inventoryIds}
        inventoryNames={asksForTarget ? target?.inventoryNames : undefined}
        asksForTarget={asksForTarget}
        target={target}
        onChangeTarget={setTarget}
        onSelectTemplate={handleSelectTemplate}
        onClose={onClose}
        isLoadingPrompts={isLoadingPrompts}
        error={error}
        onError={setError}
        {...shownPrompts}
      />
    </FormRoot>
  );
}

export default RunTemplateWizard;
