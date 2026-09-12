import React from 'react';
import styled from 'styled-components';

const Wrapper = styled.div`
  border-radius: 1em;
  background-color: var(--pf-v6-global--BackgroundColor--light-200);
  font-size: 0.6rem;
  width: max-content;
  padding: 0em 1em;
  margin-left: auto;
  margin-right: -0.3em;
`;

export interface JobEventEllipsisProps {
  isCollapsed: boolean;
  [key: string]: unknown;
}

export default function JobEventEllipsis({
  isCollapsed,
}: JobEventEllipsisProps) {
  if (!isCollapsed) {
    return null;
  }

  return <Wrapper>...</Wrapper>;
}
