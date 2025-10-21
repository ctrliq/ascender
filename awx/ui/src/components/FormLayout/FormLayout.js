import styled from 'styled-components';

export const FormColumnLayout = styled.div`
  width: 100%;
  grid-column: 1 / -1;
  display: grid;
  grid-gap: var(--pf-c-form--GridGap);
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));

  @media (min-width: 1210px) {
    grid-template-columns: repeat(3, 1fr);
  }

  ${(props) =>
    props.stacked &&
    `padding: var(--pf-global--spacer--lg) 0 var(--pf-global--spacer--md) `}
`;

export const FormFullWidthLayout = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr;
  grid-gap: var(--pf-c-form--GridGap);
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
  background-color: var(--quantic-bg-secondary);
  margin-right: calc(var(--pf-c-card--child--PaddingRight) * -1);
  margin-left: calc(var(--pf-c-card--child--PaddingLeft) * -1);
  padding: var(--quantic-spacing-6);
  border-radius: var(--quantic-radius-md);

  & > .pf-c-title {
    --pf-c-title--m-md--FontWeight: 700;
    grid-column: 1 / -1;
    margin-bottom: 20px;
  }
`;
