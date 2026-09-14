import type { WorkflowAction } from 'components/Workflow/workflowReducer';
import React, { useContext } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Button as PFButton } from '@patternfly/react-core';
import { WorkflowDispatchContext } from 'contexts/Workflow';
import './VisualizerStartScreen.css';

export interface VisualizerStartScreenProps {
  readOnly?: boolean;
  [key: string]: unknown;
}

function VisualizerStartScreen({ readOnly }: VisualizerStartScreenProps) {
  const { t } = useLingui();
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  return (
    <div className="ascender-visualizer-start-screen__flex-1">
      <div className="ascender-visualizer-start-screen__panel-wrapper">
        <div className="ascender-visualizer-start-screen__panel">
          {readOnly ? (
            <p>{t`This workflow does not have any nodes configured.`}</p>
          ) : (
            <>
              <p>{t`Please click the Start button to begin.`}</p>
              <PFButton
                className="ascender-visualizer-start-screen__button"
                ouiaId="visualizer-start-button"
                id="visualizer-start"
                aria-label={t`Start`}
                onClick={() =>
                  dispatch({ type: 'START_ADD_NODE', sourceNodeId: 1 })
                }
                variant="primary"
              >
                {t`Start`}
              </PFButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default VisualizerStartScreen;
