import styled from 'styled-components';

export default styled.div<{ $isClickable?: boolean; isFirst?: boolean }>`
  display: flex;

  &:hover {
    cursor: ${(props) => (props.$isClickable ? 'pointer' : 'default')};
  }

  &--hidden {
    display: none;
  }
  ${({ isFirst }) => (isFirst ? 'padding-top: 10px;' : '')}
`;
