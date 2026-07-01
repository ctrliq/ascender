import styled from 'styled-components';
import { CardBody } from '@patternfly/react-core';

const TabbedCardBody = styled(CardBody)`
  padding-block-start: var(--pf-v6-c-card--first-child--PaddingBlockStart);
`;
CardBody.displayName = 'PFCardBody';

export default TabbedCardBody;
