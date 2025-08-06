import React from 'react';
import styled from 'styled-components';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { AngleDownIcon, AngleRightIcon } from '@patternfly/react-icons';

const Wrapper = styled.div`
  background-color: #ebebeb;
  color: #646972;
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
  const { i18n } = useLingui();
  if (!canToggle) {
    return <Wrapper />;
  }
  return (
    <Wrapper>
      <Button onClick={onToggle} type="button">
        {isCollapsed ? (
          <AngleRightIcon size="sm" title={i18n._(t`Expand section`)} />
        ) : (
          <AngleDownIcon size="sm" title={i18n._(t`Collapse section`)} />
        )}
      </Button>
    </Wrapper>
  );
}
