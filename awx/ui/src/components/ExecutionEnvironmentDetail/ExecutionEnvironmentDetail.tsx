import type { ExecutionEnvironment, SummaryFieldRef } from 'types/api';
import React from 'react';
import { Link } from 'react-router';
import { Trans, useLingui } from '@lingui/react/macro';

import { Popover, Tooltip } from '@patternfly/react-core';
import styled from 'styled-components';
import { ExclamationTriangleIcon as PFExclamationTriangleIcon } from '@patternfly/react-icons';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import { Detail } from '../DetailList';

const ExclamationTriangleIcon = styled(PFExclamationTriangleIcon)`
  color: var(--pf-v6-global--warning-color--100);
  margin-left: 18px;
  cursor: pointer;
`;

const ExclamationTrianglePopover = styled(PFExclamationTriangleIcon)`
  color: var(--pf-v6-global--warning-color--100);
  margin-left: 18px;
  cursor: pointer;
`;

ExclamationTrianglePopover.displayName = 'ExclamationTrianglePopover';

export interface ExecutionEnvironmentDetailProps {
  /**
   * Either the entity itself or the reference summary_fields inlines, which is
   * what most callers have; only id, name and image are read.
   */
  executionEnvironment?: ExecutionEnvironment | SummaryFieldRef | null;
  isDefaultEnvironment?: boolean;
  virtualEnvironment?: React.ReactNode;
  verifyMissingVirtualEnv?: boolean;
  helpText?: React.ReactNode;
  dataCy?: string;
  [key: string]: unknown;
}

function ExecutionEnvironmentDetail({
  executionEnvironment = null,
  isDefaultEnvironment = false,
  virtualEnvironment = '',
  verifyMissingVirtualEnv = true,
  helpText = '',
  dataCy = 'execution-environment-detail',
}: ExecutionEnvironmentDetailProps) {
  const { t } = useLingui();
  const config = useConfig();
  const docsLink = `${getDocsBaseUrl(
    config
  )}/html/upgrade-migration-guide/upgrade_to_ees.html`;
  const label = isDefaultEnvironment
    ? t`Default Execution Environment`
    : t`Execution Environment`;

  if (executionEnvironment) {
    return (
      <Detail
        label={label}
        value={
          <Link
            to={`/execution_environments/${executionEnvironment.id}/details`}
          >
            {executionEnvironment.name}
          </Link>
        }
        helpText={helpText}
        dataCy={dataCy}
      />
    );
  }
  if (verifyMissingVirtualEnv && virtualEnvironment && !executionEnvironment) {
    return (
      <Detail
        label={label}
        helpText={helpText}
        value={
          <>
            {t`Missing resource`}
            <span>
              <Popover
                className="missing-execution-environment"
                headerContent={<div>{t`Execution Environment Missing`}</div>}
                bodyContent={
                  <div>
                    <Trans>
                      Custom virtual environment {virtualEnvironment} must be
                      replaced by an execution environment. For more information
                      about migrating to execution environments see{' '}
                      <a
                        href={docsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        the documentation.
                      </a>
                    </Trans>
                  </div>
                }
                position="right"
              >
                <ExclamationTrianglePopover />
              </Popover>
            </span>
          </>
        }
        dataCy={`missing-${dataCy}`}
      />
    );
  }
  if (
    !verifyMissingVirtualEnv &&
    !virtualEnvironment &&
    !executionEnvironment
  ) {
    return (
      <Detail
        label={t`Execution Environment`}
        helpText={helpText}
        value={
          <>
            {t`Missing resource`}
            <span>
              <Tooltip
                content={t`Execution environment is missing or deleted.`}
              >
                <ExclamationTriangleIcon />
              </Tooltip>
            </span>
          </>
        }
        dataCy={dataCy}
      />
    );
  }

  return null;
}

export default ExecutionEnvironmentDetail;
