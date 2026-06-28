import React, { useCallback } from 'react';
import { useLocation } from 'react-router';
import { Button, Tooltip } from '@patternfly/react-core';
import { SyncIcon } from '@patternfly/react-icons';

import { useLingui } from '@lingui/react/macro';
import useRequest, { useDismissableError } from 'hooks/useRequest';

import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { ProjectsAPI } from 'api';
import getProjectHelpStrings from './Project.helptext';

function ProjectSyncButton({ projectId, lastJobStatus = null }) {
  const { t } = useLingui();
  const projectHelpStrings = getProjectHelpStrings(t);
  const { pathname } = useLocation();

  const { request: handleSync, error: syncError } = useRequest(
    useCallback(async () => {
      await ProjectsAPI.sync(projectId);
    }, [projectId]),
    null
  );
  const { error, dismissError } = useDismissableError(syncError);
  const isDetailsView = pathname.endsWith('/details');
  const isDisabled = ['pending', 'waiting', 'running'].includes(lastJobStatus);

  return (
    <>
      {isDisabled ? (
        <Tooltip content={projectHelpStrings.syncButtonDisabled} position="top">
          <div>
            <Button
              ouiaId={`${projectId}-sync-button`}
              aria-label={t`Sync Project`}
              variant={isDetailsView ? 'secondary' : 'plain'}
              isDisabled={isDisabled}
            >
              {pathname.endsWith('/details') ? (
                t`Sync`
              ) : (
                <SyncIcon />
              )}
            </Button>
          </div>
        </Tooltip>
      ) : (
        <Button
          ouiaId={`${projectId}-sync-button`}
          aria-label={t`Sync Project`}
          variant={isDetailsView ? 'secondary' : 'plain'}
          isDisabled={isDisabled}
          onClick={handleSync}
        >
          {pathname.endsWith('/details') ? t`Sync` : <SyncIcon />}
        </Button>
      )}
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
