import React from 'react';
import styled from 'styled-components';

const DetailList = ({ children, stacked, ...props }) => (
  <dl {...props}>
    {children}
  </dl>
);

export default styled(DetailList)`
  display: grid;
  align-items: stretch;
  font-size: var(--pf-v6-global--FontSize--sm);
  column-gap: 2rem;
  row-gap: 0;
  margin: 0;
  ${(props) =>
    props.stacked
      ? `
    grid-template-columns: auto 1fr;
  `
      : `
    grid-template-columns: 1fr;

    @media (min-width: 640px) {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (min-width: 1024px) {
      grid-template-columns: repeat(3, 1fr);
    }
  `}

  & > div {
    padding: 0.875rem 0;
  }

  & dd .pf-v6-c-label {
    margin-left: -6px;
  }


  & + & {
    margin-top: var(--pf-v6-global--spacer--2xl);
  }
`;
