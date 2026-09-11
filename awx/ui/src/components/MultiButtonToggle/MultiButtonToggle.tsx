import type { Untyped } from 'types/api';
import React from 'react';
import styled from 'styled-components';
import { Button } from '@patternfly/react-core';
import ButtonGroup from './ButtonGroup';

const SmallButton = styled(Button)`
  && {
    padding: 3px 8px;
    font-size: var(--pf-v6-global--FontSize--xs);
  }
`;
SmallButton.displayName = 'SmallButton';

export interface MultiButtonToggleProps {
  /** The choices, as [value, label] pairs. */
  buttons: [Untyped, string][];
  value: unknown;
  onChange: (...args: Untyped[]) => void;
  name: React.ReactNode;
  [key: string]: unknown;
}

function MultiButtonToggle({
  buttons,
  value,
  onChange,
  name,
}: MultiButtonToggleProps) {
  const setValue = (newValue: unknown) => {
    if (value !== newValue) {
      onChange(newValue);
    }
  };

  return (
    <ButtonGroup>
      {buttons &&
        buttons.map(([buttonValue, buttonLabel]: [Untyped, string]) => (
          <SmallButton
            aria-label={buttonLabel}
            ouiaId={`${name}-${buttonLabel}-button`}
            key={buttonLabel}
            className={`toggle-button-${buttonValue}`}
            onClick={() => setValue(buttonValue)}
            variant={buttonValue === value ? 'primary' : 'secondary'}
          >
            {buttonLabel}
          </SmallButton>
        ))}
    </ButtonGroup>
  );
}

export default MultiButtonToggle;
