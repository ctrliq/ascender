import styled from 'styled-components';

const JobEventLineNumber = styled.div`
  color: var(--pf-v5-global--Color--200);
  background-color: var(--pf-v5-global--BackgroundColor--200);
  flex: 0 0 45px;
  text-align: right;
  vertical-align: top;
  padding-right: 5px;
  border-right: 1px solid var(--pf-v5-global--BorderColor--100);
  user-select: none;
`;

JobEventLineNumber.displayName = 'JobEventLineNumber';

export default JobEventLineNumber;
