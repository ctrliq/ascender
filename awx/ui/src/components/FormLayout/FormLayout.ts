import styled from 'styled-components';

export const FormColumnLayout = styled.div`
  width: 100%;
  grid-column: 1 / -1;
  display: grid;
  grid-gap: var(--pf-v6-c-form--GridGap);
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));

  @media (min-width: 1210px) {
    grid-template-columns: repeat(3, 1fr);
  }

  ${(props) =>
    props.$stacked &&
    `border-bottom: 1px solid var(--pf-v6-global--BorderColor--100);
    padding: var(--pf-v6-global--spacer--sm) 0 var(--pf-v6-global--spacer--md) `}
`;

export const FormFullWidthLayout = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr;
  grid-gap: var(--pf-v6-c-form--GridGap);
`;

export const FormCheckboxLayout = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-bottom: -10px;
  margin-right: -30px !important;

  & > * {
    margin-bottom: 10px;
    margin-right: 30px;
    align-items: center;
  }
`;

export const SubFormLayout = styled.div`
  grid-column: 1 / -1;
  background-color: var(--pf-v6-global--BackgroundColor--200);
  margin-right: calc(var(--pf-v6-c-card--child--PaddingRight) * -1);
  margin-left: calc(var(--pf-v6-c-card--child--PaddingLeft) * -1);
  padding: var(--pf-v6-global--spacer--2xl);
  border-radius: var(--pf-v6-global--BorderRadius--md);

  & > .pf-v6-c-title {
    --pf-v6-c-title--m-md--FontWeight: var(--pf-v6-global--FontWeight--bold);
    grid-column: 1 / -1;
    margin-bottom: var(--pf-v6-global--spacer--xl);
  }
`;
