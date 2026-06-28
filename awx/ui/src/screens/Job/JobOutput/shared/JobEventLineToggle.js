import React from 'react';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';
import { AngleDownIcon, AngleRightIcon } from '@patternfly/react-icons';

const Wrapper = styled.div`
  background-color: var(--ascender-gutter-bg, #e8e8e8);
  color: var(--pf-v6-global--Color--200);
  display: flex;
  flex: 0 0 30px;
  font-size: 18px;
  justify-content: center;
  line-height: 12px;
  user-select: none;
`;

const Button = styled.button`
  align-self: flex-start;
  border: 0;
  padding: 2px;
  background: transparent;
  line-height: 1;
`;

export default function JobEventLineToggle({
  canToggle,
  isCollapsed,
  onToggle,
}) {
  const { t } = useLingui();
  if (!canToggle) {
    return <Wrapper />;
  }
  return (
    <Wrapper>
      <Button onClick={onToggle} type="button">
        {isCollapsed ? (
          <AngleRightIcon title={t`Expand section`} />
        ) : (
          <AngleDownIcon title={t`Collapse section`} />
        )}
      </Button>
    </Wrapper>
  );
}
