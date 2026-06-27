import React from 'react';
import styled from 'styled-components';

const Group = styled.div`
  display: inline-flex;

  & > .pf-v6-c-button:not(:last-child) {
    &,
    &::after {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
  }

  & > .pf-v6-c-button:not(:first-child) {
    &,
    &::after {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
  }

  && > .pf-v6-c-button.pf-m-primary:not(:disabled) {
    background-color: #12a66f;
    border-color: #12a66f;
    --pf-v6-c-button--Color: #fff;
    color: #fff;
  }

  && > .pf-v6-c-button.pf-m-primary:not(:disabled):hover {
    background-color: #0e8c5d;
    border-color: #0e8c5d;
  }

  && > .pf-v6-c-button.pf-m-secondary:not(:disabled) {
    background-color: transparent;
    border-color: var(--pf-v6-global--BorderColor--100);
    --pf-v6-c-button--Color: var(--pf-v6-global--Color--200);
    color: var(--pf-v6-global--Color--200);
  }

  && > .pf-v6-c-button.pf-m-secondary:not(:disabled):hover {
    background-color: var(--pf-v6-global--BackgroundColor--200);
    border-color: var(--pf-v6-global--BorderColor--100);
  }
`;

function ButtonGroup({ children }) {
  return <Group>{children}</Group>;
}

export default ButtonGroup;
