import styled from 'styled-components';

const JobEventLineText = styled.div`
  padding: 0 15px;
  white-space: pre-wrap;
  word-break: break-all;
  word-wrap: break-word;

  .time {
    font-size: 14px;
    font-weight: 600;
    user-select: none;
    background-color: var(--pf-v5-global--BackgroundColor--200);
    border-radius: 12px;
    padding: 2px 10px;
    margin-left: 15px;
  }

  .content {
    background: var(--pf-v5-global--disabled-color--200);
    background: linear-gradient(
      to right,
      var(--pf-v5-global--BackgroundColor--100) 10%,
      var(--pf-v5-global--BackgroundColor--200) 18%,
      var(--pf-v5-global--BackgroundColor--100) 33%
    );
    border-radius: 5px;
  }
`;

JobEventLineText.displayName = 'JobEventLineText';

export default JobEventLineText;
