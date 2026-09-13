import React from 'react';
import { Button } from '@patternfly/react-core';
import ButtonGroup from './ButtonGroup';
import './MultiButtonToggle.css';

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
          <Button
            aria-label={buttonLabel}
            ouiaId={`${name}-${buttonLabel}-button`}
            key={buttonLabel}
            className={`awx-multi-button-toggle__small-button ${`toggle-button-${buttonValue}`}`}
            onClick={() => setValue(buttonValue)}
            variant={buttonValue === value ? 'primary' : 'secondary'}
          >
            {buttonLabel}
          </Button>
        ))}
    </ButtonGroup>
  );
}

export default MultiButtonToggle;
