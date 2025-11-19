import React from 'react';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';
import {
  LucideIconChevronDown,
  LucideIconChevronRight,
} from '@ctrliq/quantic-react';

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
  const { t } = useLingui();
  if (!canToggle) {
    return <Wrapper />;
  }
  return (
    <Wrapper>
      <Button onClick={onToggle} type="button">
        {isCollapsed ? (
          <LucideIconChevronRight
            size={14}
            title={t`Expand section`}
            data-original-icon="AngleRightIcon"
          />
        ) : (
          <LucideIconChevronDown
            size={14}
            title={t`Collapse section`}
            data-original-icon="AngleDownIcon"
          />
        )}
      </Button>
    </Wrapper>
  );
}
