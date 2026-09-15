import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Tooltip } from '@patternfly/react-core';
import { ExclamationCircleIcon as PFExclamationCircleIcon } from '@patternfly/react-icons';
import { getVerbosityLabel } from '../VerbositySelectField';
import { toTitleCase } from '../../util/strings';
import { VariablesDetail } from '../CodeEditor';
import { jsonToYaml } from '../../util/yaml';
import { DetailList, Detail } from '../DetailList';
import type { AdHocValues } from './types';
import './AdHocPreviewStep.css';

export interface AdHocPreviewStepProps {
  hasErrors: boolean;
  /** The wizard's values, which this step lists back as details. */
  values: AdHocValues;
  [key: string]: unknown;
}

function AdHocPreviewStep({ hasErrors, values }: AdHocPreviewStepProps) {
  const { t, i18n } = useLingui();
  const { credentials, execution_environment, extra_vars, verbosity } = values;

  const items = Object.entries(values) as [string, React.ReactNode][];
  return (
    <>
      {hasErrors && (
        <div className="ascender-ad-hoc-preview-step__error-message-wrapper">
          {t`Some of the previous step(s) have errors`}
          <Tooltip
            position="right"
            content={t`See errors on the left`}
            trigger="click mouseenter focus"
          >
            <PFExclamationCircleIcon className="ascender-ad-hoc-preview-step__exclamation-circle-icon" />
          </Tooltip>
        </div>
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
        {credentials && (
          <Detail label={t`Credential`} value={credentials[0]?.name} />
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
