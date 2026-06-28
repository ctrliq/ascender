import React from 'react';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';
import { Alert } from '@patternfly/react-core';

const AlertWrapper = styled.div`
  margin-top: var(--pf-v6-global--spacer--lg);
  margin-bottom: var(--pf-v6-global--spacer--lg);
`;
const RulesTitle = styled.p`
  margin-top: var(--pf-v6-global--spacer--lg);
  margin-bottom: var(--pf-v6-global--spacer--lg);
  font-weight: var(--pf-v6-global--FontWeight--bold);
`;

export default function UnsupportedRRuleAlert({ schedule }) {
  const { t } = useLingui();
  return (
    <AlertWrapper>
      <Alert
        isInline
        variant="danger"
        ouiaId="schedule-warning"
        title={t`This schedule uses complex rules that are not supported in the\n        UI.  Please use the API to manage this schedule.`}
      />
      <RulesTitle>{t`Schedule Rules`}:</RulesTitle>
      <pre style={{ fontFamily: 'var(--pf-t--global--font--family--mono)' }}>
        {schedule.rrule.split(' ').join('\n')}
      </pre>
    </AlertWrapper>
  );
}
