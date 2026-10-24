import type { ApiEntity, LaunchCredential, SchedulesApiModel } from 'types/api';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
  InventorySourcesAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  SystemJobTemplatesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import type { LaunchConfig, SurveyConfig } from 'components/LaunchPrompt/types';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { keepsHistory } from 'components/JobList/LaunchDaysPrompt';
import { useForgetModalParams } from 'components/JobList/runModalParams';
import LAUNCH_PROMPT_NAMESPACES from 'components/LaunchPrompt/namespaces';
import { ToolbarAddButton } from 'components/PaginatedTable';
import ScheduleAdd from '../ScheduleAdd';
import ScheduleWizardBody from '../shared/ScheduleWizardBody';
import ScheduleResourcePicker, {
  canSchedule,
  QS_CONFIG as PICKER_QS_CONFIG,
} from './ScheduleResourcePicker';
import './AddScheduleButton.css';

/** The model whose schedules a resource of each kind is added to. */
const API_FOR: Record<string, SchedulesApiModel> = {
  job_template: JobTemplatesAPI as unknown as SchedulesApiModel,
  workflow_job_template:
    WorkflowJobTemplatesAPI as unknown as SchedulesApiModel,
  project: ProjectsAPI as unknown as SchedulesApiModel,
  inventory_source: InventorySourcesAPI as unknown as SchedulesApiModel,
  system_job_template: SystemJobTemplatesAPI as unknown as SchedulesApiModel,
};

/** Where a saved schedule can be read, which is its resource's own screen. */
const detailPathFor = (resource: ApiEntity, scheduleId: number) => {
  const id = resource.id as number;
  switch (resource.type) {
    case 'job_template':
    case 'workflow_job_template':
      return `/templates/${resource.type}/${id}/schedules/${scheduleId}`;
    case 'project':
      return `/projects/${id}/schedules/${scheduleId}`;
    case 'inventory_source':
      return `/inventories/inventory/${
        (resource as { inventory?: number }).inventory
      }/sources/${id}/schedules/${scheduleId}`;
    case 'system_job_template':
      return `/cleanup_jobs/${id}/schedules/${scheduleId}`;
    default:
      return '/schedules';
  }
};

/**
 * The lists the modal holds, by the namespace each pages under: the picker,
 * and the prompt steps the form puts after it. What they wrote into the
 * address outlives the modal, and would filter the next one opened.
 */
const MODAL_NAMESPACES = [
  PICKER_QS_CONFIG.namespace,
  ...Object.values(LAUNCH_PROMPT_NAMESPACES),
];

/** What a template prompts for, which the schedule form asks again. */
interface ResourcePrompts {
  /** The resource these were read for, so a stale answer is never used. */
  forId?: number;
  launchConfig?: LaunchConfig;
  surveyConfig?: SurveyConfig | null;
  credentials?: LaunchCredential[];
}

/**
 * Add, on the schedules list that belongs to nothing.
 *
 * Every other schedules list is a resource's own tab, so its add button knows
 * what the schedule is for and links straight to the form. This one covers
 * every schedule there is, so it asks that first and puts the form on the step
 * after it: the same form the resource's own screen shows, filled in and saved
 * without leaving the list it was opened from.
 */
function AddScheduleButton() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [picked, setPicked] = useState<ApiEntity | null>(null);
  const [prompts, setPrompts] = useState<ResourcePrompts>({});
  const [isReadingPrompts, setIsReadingPrompts] = useState(false);
  const [promptError, setPromptError] = useState<unknown>(null);
  /*
   * Which read is the current one. Picking A and then B starts two reads, and
   * nothing says A answers first: a read that is no longer the latest drops
   * its answer, its error and its end of loading, so B is never left waiting
   * behind A's prompts, and A finishing does not clear B's spinner.
   */
  const latestRead = useRef(0);
  const forgetModalParams = useForgetModalParams(MODAL_NAMESPACES);

  const close = () => {
    latestRead.current += 1;
    setPicked(null);
    setPrompts({});
    setPromptError(null);
    setIsReadingPrompts(false);
    setIsOpen(false);
    forgetModalParams();
  };

  /*
   * What the picked template prompts for, read before its form is built: the
   * form takes its fields from these as it mounts, the same way the resource's
   * own screen hands them down.
   */
  const readPrompts = useCallback(async (resource: ApiEntity) => {
    const isTemplate =
      resource.type === 'job_template' ||
      resource.type === 'workflow_job_template';
    const id = resource.id as number;
    latestRead.current += 1;
    const thisRead = latestRead.current;
    const isCurrent = () => latestRead.current === thisRead;
    /* Nothing to read for the rest, nor for a row that cannot be scheduled,
       which stays on the list with its reason instead. */
    if (!isTemplate || !canSchedule(resource)) {
      setIsReadingPrompts(false);
      setPrompts({ forId: id });
      return;
    }
    const api =
      resource.type === 'workflow_job_template'
        ? WorkflowJobTemplatesAPI
        : JobTemplatesAPI;
    setIsReadingPrompts(true);
    try {
      const { data: launchConfig } = await api.readLaunch(id);
      const read: ResourcePrompts = { forId: id, launchConfig };
      if (launchConfig.survey_enabled) {
        const { data } = await api.readSurvey(id);
        read.surveyConfig = data;
      }
      if (launchConfig.ask_credential_on_launch && api === JobTemplatesAPI) {
        const {
          data: { results },
        } = await JobTemplatesAPI.readCredentials(id);
        read.credentials = results;
      }
      if (isCurrent()) {
        setPrompts(read);
      }
    } catch (err) {
      if (isCurrent()) {
        setPromptError(err);
      }
    } finally {
      if (isCurrent()) {
        setIsReadingPrompts(false);
      }
    }
  }, []);

  useEffect(() => {
    if (picked) {
      readPrompts(picked);
    }
  }, [picked, readPrompts]);

  /*
   * A manual project has nothing to run on a schedule, and a resource the
   * account may only read has nothing to add to it: both come back in the
   * list, since the api has no filter for either, so the row is picked and
   * the reason is given rather than the row being silently missing.
   */
  const refusal = Boolean(picked) && !canSchedule(picked as ApiEntity);

  /*
   * A new pick forgets the last one's prompts, so the form is never built
   * from another resource's answers while this one's are being read.
   */
  const pick = (resource: ApiEntity | null) => {
    setPrompts({});
    setPicked(resource);
  };

  /*
   * Whether the form can be built: nothing picked yet, or the picked resource's
   * prompts are in. The form takes its fields from them as it mounts, so it is
   * built once they are here rather than once before and again after.
   */
  const isReady = !picked || prompts.forId === picked.id;

  /*
   * Picking rebuilds the wizard around what was picked, so it opens again on
   * the step after the picker, as the run wizard does after its template. A
   * refused row stays on the picker, which is where its reason is.
   */
  const startIndex = picked && !refusal ? 2 : 1;

  /* The step the reader starts on, which the form's own wizard carries ahead
     of its fields: one wizard, whatever the schedule turns out to need. */
  const pickerStep = {
    id: 'resource',
    name: t`Schedule for`,
    component: <ScheduleResourcePicker picked={picked} onPick={pick} />,
    enableNext: Boolean(picked) && !refusal && !isReadingPrompts,
  };

  /*
   * What the modal shows: the error, the wizard while the picked resource's
   * prompts are read, and the wizard with its form once they are in.
   */
  let modal: React.ReactNode;
  if (promptError) {
    modal = (
      <AlertModal isOpen variant="error" title={t`Error!`} onClose={close}>
        {t`Failed to read what this resource prompts for.`}
        <ErrorDetail error={promptError} />
      </AlertModal>
    );
  } else if (!isReady) {
    modal = (
      <ScheduleWizardBody
        isLoading
        firstStep={pickerStep}
        title={t`Add Schedule`}
        className="ascender-add-schedule"
        startIndex={startIndex}
        onClose={close}
        onSave={() => {}}
      />
    );
  } else {
    modal = (
      <ScheduleAdd
        /*
         * One form per resource: the fields it opens with, and the steps
         * after them, are built from what that resource prompts for.
         */
        key={picked?.id ?? 'none'}
        resource={(picked ?? {}) as ApiEntity}
        apiModel={
          API_FOR[String(picked?.type)] ??
          (JobTemplatesAPI as unknown as SchedulesApiModel)
        }
        launchConfig={prompts.launchConfig}
        surveyConfig={prompts.surveyConfig}
        resourceDefaultCredentials={prompts.credentials}
        /* Only the cleanup jobs that keep some history ask how much of it:
           the rest, such as expired sessions, take no days at all. */
        hasDaysToKeepField={
          picked?.type === 'system_job_template' && keepsHistory(picked)
        }
        asWizard
        firstStep={pickerStep}
        wizardTitle={t`Add Schedule`}
        wizardClassName="ascender-add-schedule"
        wizardStartIndex={startIndex}
        onSaved={(scheduleId) => {
          const resource = picked as ApiEntity;
          close();
          navigate(detailPathFor(resource, scheduleId));
        }}
        onCancel={close}
      />
    );
  }

  return (
    <>
      <ToolbarAddButton
        ouiaId="add-schedule-button"
        key="add"
        tooltip={t`Add Schedule`}
        onClick={() => setIsOpen(true)}
      />
      {isOpen && modal}
    </>
  );
}

export default AddScheduleButton;
