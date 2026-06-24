import React from 'react';
import styled from 'styled-components';
import { Link } from 'react-router';
import { Card } from '@patternfly/react-core';

const CountCard = styled(Card)`
  padding: var(--pf-global--spacer--md);
  display: flex;
  align-items: center;
  padding-top: var(--pf-global--spacer--sm);
  cursor: pointer;
  text-align: center;
  color: var(--pf-global--Color--100);
  text-decoration: none;

  & h2 {
    font-size: var(--pf-global--FontSize--4xl);
    color: var(--pf-global--primary-color--100);
    text-decoration: none;
    margin-bottom: 0.5rem;
  }

  & h2.failed {
    color: var(--pf-global--danger-color--100);
  }
`;

const CountLink = styled(Link)`
  display: contents;
  &:hover {
    text-decoration: none;
  }
`;

function Count({ failed, link, data, label }) {
  return (
    <CountLink to={link}>
      <CountCard isHoverable>
        <h2 className={failed && 'failed'}>{data || 0}</h2>
        {label}
      </CountCard>
    </CountLink>
  );
}

export default Count;
