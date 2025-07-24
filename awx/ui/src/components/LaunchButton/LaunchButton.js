import React, { useState, useRef, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { number, shape } from 'prop-types';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
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
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';
import LaunchPrompt from '../LaunchPrompt';

function canLaunchWithoutPrompt(launchData) {
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

function LaunchButton({ resource, children }) {
  const { i18n } = useLingui();
  const history = useHistory();
  const [showLaunchPrompt, setShowLaunchPrompt] = useState(false);
  const [launchConfig, setLaunchConfig] = useState(null);
  const [surveyConfig, setSurveyConfig] = useState(null);
  const [labels, setLabels] = useState([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const [resourceCredentials, setResourceCredentials] = useState([]);
  const [error, setError] = useState(null);
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
      title: i18n._(msg`A job has already been launched`),
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

        const allLabels = results.map((label) => ({
          ...label,
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

  const launchWithParams = async (params) => {
    if (isLaunching) {
      showToast();
      return;
    }
    setIsLaunching(true);
    try {
      let jobPromise;

      if (resource.type === 'job_template') {
        jobPromise = JobTemplatesAPI.launch(resource.id, params || {});
      } else if (resource.type === 'workflow_job_template') {
        jobPromise = WorkflowJobTemplatesAPI.launch(resource.id, params || {});
      } else if (resource.type === 'job') {
        jobPromise = JobsAPI.relaunch(resource.id, params || {});
      } else if (resource.type === 'workflow_job') {
        jobPromise = WorkflowJobsAPI.relaunch(resource.id, params || {});
      } else if (resource.type === 'ad_hoc_command') {
        if (params?.credential_passwords) {
          // The api expects the passwords at the top level of the object instead of nested
          // in credential_passwords like the other relaunch endpoints
          Object.keys(params.credential_passwords).forEach((key) => {
            params[key] = params.credential_passwords[key];
          });

          delete params.credential_passwords;
        }
        jobPromise = AdHocCommandsAPI.relaunch(resource.id, params || {});
      }

      const { data: job } = await jobPromise;
      if (isMounted.current) history.push(`/jobs/${job.id}/output`);
    } catch (launchError) {
      if (isMounted.current) setError(launchError);
    } finally {
      if (isMounted.current) setIsLaunching(false);
    }
  };

  const handleRelaunch = async (params) => {
    let readRelaunch;
    let relaunch;

    if (isLaunching) {
      showToast();
      return;
    }
    setIsLaunching(true);
    if (resource.type === 'inventory_update') {
      // We'll need to handle the scenario where the src no longer exists
      readRelaunch = InventorySourcesAPI.readLaunchUpdate(
        resource.inventory_source
      );
    } else if (resource.type === 'project_update') {
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
      const { data: relaunchConfig } = await readRelaunch;
      if (isMounted.current) setLaunchConfig(relaunchConfig);
      if (
        !relaunchConfig.passwords_needed_to_start ||
        relaunchConfig.passwords_needed_to_start.length === 0
      ) {
        if (resource.type === 'inventory_update') {
          relaunch = InventorySourcesAPI.launchUpdate(
            resource.inventory_source
          );
        } else if (resource.type === 'project_update') {
          relaunch = ProjectsAPI.launchUpdate(resource.project);
        } else if (resource.type === 'workflow_job') {
          relaunch = WorkflowJobsAPI.relaunch(resource.id);
        } else if (resource.type === 'ad_hoc_command') {
          relaunch = AdHocCommandsAPI.relaunch(resource.id);
        } else if (resource.type === 'job') {
          relaunch = JobsAPI.relaunch(resource.id, params || {});
        }
        const { data: job } = await relaunch;
        if (isMounted.current) history.push(`/jobs/${job.id}/output`);
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
          title={i18n._(msg`Error!`)}
          onClose={() => setError(null)}
        >
          {i18n._(msg`Failed to launch job.`)}
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

LaunchButton.propTypes = {
  resource: shape({
    id: number.isRequired,
  }).isRequired,
};

export default LaunchButton;
