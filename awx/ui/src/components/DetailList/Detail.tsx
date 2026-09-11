import React from 'react';

import styled from 'styled-components';
import Popover from '../Popover';

const DetailName = styled(({ fullWidth, component, ...props }) => (
  <dt {...props} />
))`
  font-size: var(--pf-v6-global--FontSize--xs);
  font-weight: var(--pf-v6-global--FontWeight--bold);
  color: var(--pf-v6-global--Color--200);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 0.25rem;
  ${(props) =>
    props.fullWidth &&
    `
    grid-column: 1 / -1;
  `}
`;

const DetailValue = styled(
  ({ fullWidth, isEncrypted, isNotConfigured, component, ...props }) => (
    <dd {...props} />
  )
)`
  overflow-wrap: break-word;
  margin: 0;
  ${(props) =>
    props.fullWidth &&
    `
    grid-column: 1 / -1;
  `}
  ${(props) =>
    (props.isEncrypted || props.isNotConfigured) &&
    `
    color: var(--pf-v6-global--disabled-color--100);
  `}
`;

export interface DetailProps {
  label: React.ReactNode;
  value?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
  dataCy?: string;
  alwaysVisible?: boolean;
  isEmpty?: boolean;
  helpText?: React.ReactNode;
  isEncrypted?: boolean;
  isNotConfigured?: boolean;
  [key: string]: unknown;
}

const Detail = ({
  label,
  value,
  fullWidth = false,
  className,
  dataCy,
  alwaysVisible = false,
  isEmpty,
  helpText,
  isEncrypted,
  isNotConfigured,
}: DetailProps) => {
  if (!value && typeof value !== 'number' && !alwaysVisible) {
    return null;
  }

  if (isEmpty && !alwaysVisible) {
    return null;
  }

  const labelCy = dataCy ? `${dataCy}-label` : null;
  const valueCy = dataCy ? `${dataCy}-value` : null;

  return (
    <div>
      <DetailName
        className={className}
        fullWidth={fullWidth}
        data-cy={labelCy}
        id={dataCy}
      >
        {label}
        {helpText && <Popover header={label} content={helpText} id={dataCy} />}
      </DetailName>
      <DetailValue
        className={className}
        fullWidth={fullWidth}
        data-cy={valueCy}
        isEncrypted={isEncrypted}
        isNotConfigured={isNotConfigured}
      >
        {value}
      </DetailValue>
    </div>
  );
};
export default Detail;
export { DetailName };
export { DetailValue };
