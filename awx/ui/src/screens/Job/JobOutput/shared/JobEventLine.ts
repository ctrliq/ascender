import type { Untyped } from 'types/api';
import styled from 'styled-components';

export default styled.div<{ $isClickable?: Untyped; isFirst?: Untyped }>`
  display: flex;

  &:hover {
    cursor: ${(props) => (props.$isClickable ? 'pointer' : 'default')};
  }

  &--hidden {
    display: none;
  }
  ${({ isFirst }) => (isFirst ? 'padding-top: 10px;' : '')}
`;
