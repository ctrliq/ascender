import React from 'react';
import styled from 'styled-components';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Alert } from '@patternfly/react-core';

const AlertWrapper = styled.div`
  margin-top: var(--pf-global--spacer--lg);
  margin-bottom: var(--pf-global--spacer--lg);
`;
const RulesTitle = styled.p`
  margin-top: var(--pf-global--spacer--lg);
  margin-bottom: var(--pf-global--spacer--lg);
  font-weight: var(--pf-global--FontWeight--bold);
`;

export default function UnsupportedRRuleAlert({ schedule }) {
  const { i18n } = useLingui();
  return (
    <AlertWrapper>
      <Alert
        isInline
        variant="danger"
        ouiaId="schedule-warning"
        title={i18n._(
          msg`This schedule uses complex rules that are not supported in the\n        UI.  Please use the API to manage this schedule.`
        )}
      />
      <RulesTitle>{i18n._(msg`Schedule Rules`)}:</RulesTitle>
      <pre css="white-space: pre; font-family: var(--pf-global--FontFamily--monospace)">
        {schedule.rrule.split(' ').join('\n')}
      </pre>
    </AlertWrapper>
  );
}
