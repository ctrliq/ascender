import React from 'react';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { Tooltip } from '@patternfly/react-core';
import { ExclamationCircleIcon as PFExclamationCircleIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import { VERBOSITY } from '../VerbositySelectField';
import { toTitleCase } from '../../util/strings';
import { VariablesDetail } from '../CodeEditor';
import { jsonToYaml } from '../../util/yaml';
import { DetailList, Detail } from '../DetailList';

const ExclamationCircleIcon = styled(PFExclamationCircleIcon)`
  margin-left: 10px;
  margin-top: -2px;
`;

const ErrorMessageWrapper = styled.div`
  align-items: center;
  color: var(--pf-global--danger-color--200);
  display: flex;
  font-weight: var(--pf-global--FontWeight--bold);
  margin-bottom: 10px;
`;
function AdHocPreviewStep({ hasErrors, values }) {
  const { i18n } = useLingui();
  const { credential, execution_environment, extra_vars, verbosity } = values;

  const items = Object.entries(values);
  return (
    <>
      {hasErrors && (
        <ErrorMessageWrapper>
          {i18n._(t`Some of the previous step(s) have errors`)}
          <Tooltip
            position="right"
            content={i18n._(t`See errors on the left`)}
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
          <Detail label={i18n._(t`Credential`)} value={credential[0]?.name} />
        )}
        {execution_environment && (
          <Detail
            label={i18n._(t`Execution Environment`)}
            value={execution_environment[0]?.name}
          />
        )}
        {verbosity && (
          <Detail
            label={i18n._(t`Verbosity`)}
            value={VERBOSITY(i18n)[values.verbosity]}
          />
        )}
        {extra_vars && (
          <VariablesDetail
            value={jsonToYaml(JSON.stringify(extra_vars))}
            rows={4}
            label={i18n._(t`Variables`)}
            name="extra_vars"
          />
        )}
      </DetailList>
    </>
  );
}

export default AdHocPreviewStep;
