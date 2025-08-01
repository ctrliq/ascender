import React from 'react';
import { bool, string } from 'prop-types';
import { Link } from 'react-router-dom';
import { msg, Trans } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { Popover, Tooltip } from '@patternfly/react-core';
import styled from 'styled-components';
import { ExclamationTriangleIcon as PFExclamationTriangleIcon } from '@patternfly/react-icons';
import { ExecutionEnvironment } from 'types';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import { Detail } from '../DetailList';

const ExclamationTriangleIcon = styled(PFExclamationTriangleIcon)`
  color: var(--pf-global--warning-color--100);
  margin-left: 18px;
  cursor: pointer;
`;

const ExclamationTrianglePopover = styled(PFExclamationTriangleIcon)`
  color: var(--pf-global--warning-color--100);
  margin-left: 18px;
  cursor: pointer;
`;

ExclamationTrianglePopover.displayName = 'ExclamationTrianglePopover';

function ExecutionEnvironmentDetail({
  executionEnvironment,
  isDefaultEnvironment,
  virtualEnvironment,
  verifyMissingVirtualEnv,
  helpText,
  dataCy,
}) {
  const { i18n } = useLingui();
  const config = useConfig();
  const docsLink = `${getDocsBaseUrl(
    config
  )}/html/upgrade-migration-guide/upgrade_to_ees.html`;
  const label = isDefaultEnvironment
    ? i18n._(msg`Default Execution Environment`)
    : i18n._(msg`Execution Environment`);

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
            {i18n._(msg`Missing resource`)}
            <span>
              <Popover
                className="missing-execution-environment"
                headerContent={
                  <div>{i18n._(msg`Execution Environment Missing`)}</div>
                }
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
        label={i18n._(msg`Execution Environment`)}
        helpText={helpText}
        value={
          <>
            {i18n._(msg`Missing resource`)}
            <span>
              <Tooltip
                content={i18n._(
                  msg`Execution environment is missing or deleted.`
                )}
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

ExecutionEnvironmentDetail.propTypes = {
  executionEnvironment: ExecutionEnvironment,
  isDefaultEnvironment: bool,
  virtualEnvironment: string,
  verifyMissingVirtualEnv: bool,
  helpText: string,
  dataCy: string,
};

ExecutionEnvironmentDetail.defaultProps = {
  isDefaultEnvironment: false,
  executionEnvironment: null,
  virtualEnvironment: '',
  verifyMissingVirtualEnv: true,
  helpText: '',
  dataCy: 'execution-environment-detail',
};

export default ExecutionEnvironmentDetail;
