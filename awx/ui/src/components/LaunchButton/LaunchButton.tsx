import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
  AdHocCommandsAPI,
  InventorySourcesAPI,
  JobsAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  WorkflowJobsAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import useToast, { AlertVariant } from 'hooks/useToast';
import type { LaunchConfig, SurveyConfig } from 'components/LaunchPrompt/types';
import type {
  AnyJob,
  ApiResponse,
  LaunchableResource,
  LaunchCredential,
} from 'types/api';
import type { LabelInput } from 'util/labels';
import { JOB_TYPE_URL_SEGMENTS } from '../../constants';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';
import LaunchPrompt from '../LaunchPrompt';

function canLaunchWithoutPrompt(launchData: LaunchConfig) {
  return (
    launchData.can_start_without_user_input &&
    !launchData.ask_inventory_on_launch &&
    !launchData.ask_variables_on_launch &&
    !launchData.ask_limit_on_launch &&
    !launchData.ask_scm_branch_on_launch &&
    !launchData.ask_execution_environment_on_launch &&
    !launchData.ask_labels_on_launch &&
    !launchData.ask_forks_on_launch &&
    !launchData.ask_job_slice_count_on_launch &&
    !launchData.ask_timeout_on_launch &&
    !launchData.ask_instance_groups_on_launch &&
    !launchData.survey_enabled &&
    (!launchData.passwords_needed_to_start ||
      launchData.passwords_needed_to_start.length === 0) &&
    (!launchData.variables_needed_to_start ||
      launchData.variables_needed_to_start.length === 0)
  );
}

/**
 * What a launch or a relaunch posts.
 *
 * The named keys are the ones this component reads on its way through; the
 * rest are whatever the prompt collected, which the api endpoint decides.
 */
export interface LaunchParams {
  credential_passwords?: Record<string, string>;
  [key: string]: unknown;
}

/** What LaunchButton hands whatever renders the button itself. */
export interface LaunchButtonRenderProps {
  /** Launches the resource, prompting first when it asks for anything. */
  handleLaunch: () => void;
  /** Relaunches a finished job, optionally only its failed hosts. */
  handleRelaunch: (params?: Record<string, unknown>) => void;
  isLaunching: boolean;
}

export interface LaunchButtonProps {
  /**
   * Always a real resource here: the button is rendered from a row or from a
   * detail screen, where a prompt's own resource may still be empty.
   */
  resource: LaunchableResource & { id: number };
  /**
   * A render prop rather than an element, because the caller decides what the
   * button looks like: a toolbar button, a kebab item, or an icon in a row.
   */
  children: (props: LaunchButtonRenderProps) => React.ReactNode;
  [key: string]: unknown;
}

function LaunchButton({ resource, children }: LaunchButtonProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [showLaunchPrompt, setShowLaunchPrompt] = useState(false);
  const [launchConfig, setLaunchConfig] = useState<LaunchConfig | null>(null);
  const [surveyConfig, setSurveyConfig] = useState<SurveyConfig | null>(null);
  const [labels, setLabels] = useState<LabelInput[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const [resourceCredentials, setResourceCredentials] = useState<
    LaunchCredential[]
  >([]);
  const [error, setError] = useState<unknown>(null);
  const { addToast, Toast, toastProps } = useToast();

  // Add isMounted ref to prevent state updates after unmount
  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const showToast = () => {
    addToast({
      id: resource.id,
      title: t`A job has already been launched`,
      variant: AlertVariant.info,
      hasTimeout: true,
    });
  };

  const handleLaunch = async () => {
    if (isLaunching) {
      showToast();
      return;
    }
    setIsLaunching(true);
    const readLaunch =
      resource.type === 'workflow_job_template'
        ? WorkflowJobTemplatesAPI.readLaunch(resource.id)
        : JobTemplatesAPI.readLaunch(resource.id);
    const readSurvey =
      resource.type === 'workflow_job_template'
        ? WorkflowJobTemplatesAPI.readSurvey(resource.id)
        : JobTemplatesAPI.readSurvey(resource.id);
    const readLabels =
      resource.type === 'workflow_job_template'
        ? WorkflowJobTemplatesAPI.readAllLabels(resource.id)
        : JobTemplatesAPI.readAllLabels(resource.id);

    try {
      const { data: launch } = await readLaunch;
      if (isMounted.current) setLaunchConfig(launch);

      if (launch.survey_enabled) {
        const { data } = await readSurvey;
        if (isMounted.current) setSurveyConfig(data);
      }

      if (launch.ask_labels_on_launch) {
        const {
          data: { results },
        } = await readLabels;

        // The schema has a label's name nullable; the labels field takes a
        // string, and a label the api sent always has one.
        const allLabels = results.map((label) => ({
          ...label,
          name: label.name ?? '',
          isReadOnly: true,
        }));

        if (isMounted.current) setLabels(allLabels);
      }

      if (launch.ask_credential_on_launch) {
        const {
          data: { results: templateCredentials },
        } = await JobTemplatesAPI.readCredentials(resource.id);
        if (isMounted.current) setResourceCredentials(templateCredentials);
      }

      if (canLaunchWithoutPrompt(launch)) {
        await launchWithParams({});
      } else if (isMounted.current) {
        setShowLaunchPrompt(true);
      }
    } catch (err) {
      if (isMounted.current) setError(err);
    } finally {
      if (isMounted.current) setIsLaunching(false);
    }
  };

  const launchWithParams = async (params: LaunchParams) => {
    if (isLaunching) {
      showToast();
      return;
    }
    setIsLaunching(true);
    try {
      let jobPromise: Promise<ApiResponse<AnyJob>> | undefined;

      if (resource.type === 'job_template') {
        jobPromise = JobTemplatesAPI.launch(resource.id, params || {});
      } else if (resource.type === 'workflow_job_template') {
        jobPromise = WorkflowJobTemplatesAPI.launch(resource.id, params || {});
      } else if (resource.type === 'job') {
        jobPromise = JobsAPI.relaunch(resource.id, params || {});
      } else if (resource.type === 'workflow_job') {
        jobPromise = WorkflowJobsAPI.relaunch(resource.id, params || {});
      } else if (resource.type === 'ad_hoc_command') {
        // The api expects the passwords at the top level of the object instead of nested
        // in credential_passwords like the other relaunch endpoints
        const { credential_passwords: credentialPasswords, ...rest } =
          params || {};
        jobPromise = AdHocCommandsAPI.relaunch(resource.id, {
          ...rest,
          ...credentialPasswords,
        });
      }

      // Every type the button is rendered for is launched above; the guard is
      // what says so, since the branches are the only thing that assigns it.
      if (!jobPromise) {
        return;
      }
      const { data: job } = await jobPromise;
      if (isMounted.current) {
        const seg = JOB_TYPE_URL_SEGMENTS[job.type];
        navigate(
          seg ? `/jobs/${seg}/${job.id}/output` : `/jobs/${job.id}/output`
        );
      }
    } catch (launchError) {
      if (isMounted.current) setError(launchError);
    } finally {
      if (isMounted.current) setIsLaunching(false);
    }
  };

  const handleRelaunch = async (params?: LaunchParams) => {
    let readRelaunch: Promise<ApiResponse<LaunchConfig>> | undefined;
    let relaunch: Promise<ApiResponse<AnyJob>> | undefined;

    if (isLaunching) {
      showToast();
      return;
    }
    setIsLaunching(true);
    if (resource.type === 'inventory_update' && resource.inventory_source) {
      // We'll need to handle the scenario where the src no longer exists
      readRelaunch = InventorySourcesAPI.readLaunchUpdate(
        resource.inventory_source
      );
    } else if (resource.type === 'project_update' && resource.project) {
      // We'll need to handle the scenario where the project no longer exists
      readRelaunch = ProjectsAPI.readLaunchUpdate(resource.project);
    } else if (resource.type === 'workflow_job') {
      readRelaunch = WorkflowJobsAPI.readRelaunch(resource.id);
    } else if (resource.type === 'ad_hoc_command') {
      readRelaunch = AdHocCommandsAPI.readRelaunch(resource.id);
    } else if (resource.type === 'job') {
      readRelaunch = JobsAPI.readRelaunch(resource.id);
    }

    try {
      // As above: every type the relaunch button is rendered for is read here.
      if (!readRelaunch) {
        return;
      }
      const { data: relaunchConfig } = await readRelaunch;
      if (isMounted.current) setLaunchConfig(relaunchConfig);
      if (
        !relaunchConfig.passwords_needed_to_start ||
        relaunchConfig.passwords_needed_to_start.length === 0
      ) {
        if (resource.type === 'inventory_update' && resource.inventory_source) {
          relaunch = InventorySourcesAPI.launchUpdate(
            resource.inventory_source
          );
        } else if (resource.type === 'project_update' && resource.project) {
          relaunch = ProjectsAPI.launchUpdate(resource.project);
        } else if (resource.type === 'workflow_job') {
          relaunch = WorkflowJobsAPI.relaunch(resource.id, params || {});
        } else if (resource.type === 'ad_hoc_command') {
          relaunch = AdHocCommandsAPI.relaunch(resource.id);
        } else if (resource.type === 'job') {
          relaunch = JobsAPI.relaunch(resource.id, params || {});
        }
        if (!relaunch) {
          return;
        }
        const { data: job } = await relaunch;
        if (isMounted.current) {
          const seg = JOB_TYPE_URL_SEGMENTS[job.type];
          navigate(
            seg ? `/jobs/${seg}/${job.id}/output` : `/jobs/${job.id}/output`
          );
        }
      } else if (isMounted.current) {
        setShowLaunchPrompt(true);
      }
    } catch (err) {
      if (isMounted.current) setError(err);
    } finally {
      if (isMounted.current) setIsLaunching(false);
    }
  };

  return (
    <>
      {children({
        handleLaunch,
        handleRelaunch,
        isLaunching,
      })}
      <Toast {...toastProps} />
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={t`Error!`}
          onClose={() => setError(null)}
        >
          {t`Failed to launch job.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
      {showLaunchPrompt && (
        <LaunchPrompt
          launchConfig={launchConfig}
          surveyConfig={surveyConfig}
          resource={resource}
          labels={labels}
          onLaunch={launchWithParams}
          onCancel={() => setShowLaunchPrompt(false)}
          resourceDefaultCredentials={resourceCredentials}
        />
      )}
    </>
  );
}

export default LaunchButton;
