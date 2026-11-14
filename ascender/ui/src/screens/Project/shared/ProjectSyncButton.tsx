import React, { useCallback } from 'react';
import { useLocation } from 'react-router';
import { Button } from '@patternfly/react-core';
import { SyncIcon } from '@patternfly/react-icons';

import { useLingui } from '@lingui/react/macro';
import useRequest, { useDismissableError } from 'hooks/useRequest';

import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { ProjectsAPI } from 'api';
import Tooltip from 'components/Tooltip';
import getProjectHelpStrings from './Project.helptext';

export interface ProjectSyncButtonProps {
  projectId: number;
  lastJobStatus?: string | null;
  /**
   * A labelled button with this text and tooltip, as a runs tab shows it,
   * rather than the look this button takes on its own screen.
   */
  label?: string;
  tooltip?: string;
  [key: string]: unknown;
}

function ProjectSyncButton({
  projectId,
  lastJobStatus = null,
  label,
  tooltip,
}: ProjectSyncButtonProps) {
  const { t } = useLingui();
  const projectHelpStrings = getProjectHelpStrings();
  const { pathname } = useLocation();

  const { request: handleSync, error: syncError } = useRequest(
    useCallback(async () => {
      await ProjectsAPI.sync(projectId);
    }, [projectId]),
    null
  );
  const { error, dismissError } = useDismissableError(syncError);
  const isDetailsView = pathname.endsWith('/details') || Boolean(label);
  const text = label ?? t`Sync`;
  const isDisabled = ['pending', 'waiting', 'running'].includes(
    lastJobStatus ?? ''
  );

  const syncButton = (
    <Button
      ouiaId={`${projectId}-sync-button`}
      aria-label={label ?? t`Sync Project`}
      variant={isDetailsView ? 'secondary' : 'plain'}
      isDisabled={isDisabled}
      onClick={handleSync}
    >
      {isDetailsView ? text : <SyncIcon />}
    </Button>
  );

  /*
   * A sync already under way can't be started again, so the button stands
   * disabled with the reason on hover; otherwise it carries the caller's
   * tooltip, where it was given one.
   */
  let control: React.ReactNode = syncButton;
  if (isDisabled) {
    control = (
      <Tooltip content={projectHelpStrings.syncButtonDisabled} position="top">
        {/* A disabled button takes no hover, so the wrapper carries it. */}
        <div>{syncButton}</div>
      </Tooltip>
    );
  } else if (tooltip) {
    control = (
      <Tooltip content={tooltip} position="top">
        {syncButton}
      </Tooltip>
    );
  }

  return (
    <>
      {control}
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={t`Error!`}
          onClose={dismissError}
        >
          {t`Failed to sync project.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default ProjectSyncButton;
