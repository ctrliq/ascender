import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Tooltip } from '@patternfly/react-core';
import { ExclamationCircleIcon as PFExclamationCircleIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import { getVerbosityLabel } from '../VerbositySelectField';
import { toTitleCase } from '../../util/strings';
import { VariablesDetail } from '../CodeEditor';
import { jsonToYaml } from '../../util/yaml';
import { DetailList, Detail } from '../DetailList';
import type { AdHocValues } from './types';

const ExclamationCircleIcon = styled(PFExclamationCircleIcon)`
  margin-left: 10px;
  margin-top: -2px;
`;

const ErrorMessageWrapper = styled.div`
  align-items: center;
  color: var(--pf-v6-global--danger-color--200);
  display: flex;
  font-weight: var(--pf-v6-global--FontWeight--bold);
  margin-bottom: 10px;
`;
export interface AdHocPreviewStepProps {
  hasErrors: boolean;
  /** The wizard's values, which this step lists back as details. */
  values: AdHocValues & { credential?: Untyped[] };
  [key: string]: unknown;
}

function AdHocPreviewStep({ hasErrors, values }: AdHocPreviewStepProps) {
  const { t, i18n } = useLingui();
  const { credential, execution_environment, extra_vars, verbosity } = values;

  const items = Object.entries(values) as [string, React.ReactNode][];
  return (
    <>
      {hasErrors && (
        <ErrorMessageWrapper>
          {t`Some of the previous step(s) have errors`}
          <Tooltip
            position="right"
            content={t`See errors on the left`}
            trigger="click mouseenter focus"
          >
            <ExclamationCircleIcon />
          </Tooltip>
        </ErrorMessageWrapper>
      )}
      <DetailList gutter="sm">
        {items.map(
          ([key, value]) =>
            key !== 'extra_vars' &&
            key !== 'execution_environment' &&
            key !== 'credentials' &&
            key !== 'verbosity' &&
            !key.startsWith('credential_passwords') && (
              <Detail key={key} label={toTitleCase(key)} value={value} />
            )
        )}
        {credential && (
          <Detail label={t`Credential`} value={credential[0]?.name} />
        )}
        {execution_environment && (
          <Detail
            label={t`Execution Environment`}
            value={execution_environment[0]?.name}
          />
        )}
        {verbosity && (
          <Detail
            label={t`Verbosity`}
            value={getVerbosityLabel(values.verbosity, i18n)}
          />
        )}
        {extra_vars && (
          <VariablesDetail
            value={jsonToYaml(JSON.stringify(extra_vars))}
            rows={4}
            label={t`Variables`}
            name="extra_vars"
          />
        )}
      </DetailList>
    </>
  );
}

export default AdHocPreviewStep;
