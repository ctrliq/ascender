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

function MultiButtonToggle({ buttons, value, onChange, name }) {
  const setValue = (newValue) => {
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
