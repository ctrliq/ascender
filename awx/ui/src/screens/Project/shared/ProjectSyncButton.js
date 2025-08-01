import React, { useCallback } from 'react';
import { useRouteMatch } from 'react-router-dom';
import { Button, Tooltip } from '@patternfly/react-core';
import { SyncIcon } from '@patternfly/react-icons';

import { number } from 'prop-types';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import useRequest, { useDismissableError } from 'hooks/useRequest';

import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { ProjectsAPI } from 'api';
import getProjectHelpStrings from './Project.helptext';

function ProjectSyncButton({ projectId, lastJobStatus = null }) {
  const { i18n } = useLingui();
  const projectHelpStrings = getProjectHelpStrings(i18n);
  const match = useRouteMatch();

  const { request: handleSync, error: syncError } = useRequest(
    useCallback(async () => {
      await ProjectsAPI.sync(projectId);
    }, [projectId]),
    null
  );
  const { error, dismissError } = useDismissableError(syncError);
  const isDetailsView = match.url.endsWith('/details');
  const isDisabled = ['pending', 'waiting', 'running'].includes(lastJobStatus);

  return (
    <>
      {isDisabled ? (
        <Tooltip content={projectHelpStrings.syncButtonDisabled} position="top">
          <div>
            <Button
              ouiaId={`${projectId}-sync-button`}
              aria-label={i18n._(msg`Sync Project`)}
              variant={isDetailsView ? 'secondary' : 'plain'}
              isDisabled={isDisabled}
            >
              {match.url.endsWith('/details') ? (
                i18n._(msg`Sync`)
              ) : (
                <SyncIcon />
              )}
            </Button>
          </div>
        </Tooltip>
      ) : (
        <Button
          ouiaId={`${projectId}-sync-button`}
          aria-label={i18n._(msg`Sync Project`)}
          variant={isDetailsView ? 'secondary' : 'plain'}
          isDisabled={isDisabled}
          onClick={handleSync}
        >
          {match.url.endsWith('/details') ? i18n._(msg`Sync`) : <SyncIcon />}
        </Button>
      )}
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissError}
        >
          {i18n._(msg`Failed to sync project.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

ProjectSyncButton.propTypes = {
  projectId: number.isRequired,
};

export default ProjectSyncButton;
