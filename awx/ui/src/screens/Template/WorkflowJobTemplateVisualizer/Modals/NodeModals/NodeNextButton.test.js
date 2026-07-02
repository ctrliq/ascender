import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import NodeNextButton from './NodeNextButton';

const activeStep = {
  name: 'Node Type',
  key: 'node_resource',
  enableNext: true,
  component: {},
  id: 1,
};
const buttonText = 'Next';
const onNext = jest.fn();

describe('NodeNextButton', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Button text matches', () => {
    renderWithContexts(
      <NodeNextButton
        activeStep={activeStep}
        buttonText={buttonText}
        onNext={onNext}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent(buttonText);
  });

  test('Clicking button advances exactly once', () => {
    renderWithContexts(
      <NodeNextButton
        activeStep={activeStep}
        buttonText={buttonText}
        onNext={onNext}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  test('Button is disabled when the step does not allow next', () => {
    renderWithContexts(
      <NodeNextButton
        activeStep={{ ...activeStep, enableNext: false }}
        buttonText={buttonText}
        onNext={onNext}
      />
    );
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(onNext).not.toHaveBeenCalled();
  });
});
