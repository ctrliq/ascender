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

export interface MultiButtonToggleProps<V extends string = string> {
  /** Each button's value and the label it shows. */
  buttons: [V, string][];
  value: V;
  onChange: (value: V) => void;
  name: React.ReactNode;
}

// Generic in the value so a caller whose choices are narrower than string,
// the variables editor's two modes among them, gets that type back.
function MultiButtonToggle<V extends string = string>({
  buttons,
  value,
  onChange,
  name,
}: MultiButtonToggleProps<V>) {
  const setValue = (newValue: V) => {
    if (value !== newValue) {
      onChange(newValue);
    }
  };

  return (
    <ButtonGroup>
      {buttons &&
        buttons.map(([buttonValue, buttonLabel]) => (
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
