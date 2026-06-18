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
const onClick = jest.fn();
const onNext = jest.fn();
const triggerNext = 0;

describe('NodeNextButton', () => {
  test('Button text matches', () => {
    renderWithContexts(
      <NodeNextButton
        activeStep={activeStep}
        buttonText={buttonText}
        onClick={onClick}
        onNext={onNext}
        triggerNext={triggerNext}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent(buttonText);
  });

  test('Clicking button makes expected callback', () => {
    onClick.mockClear();
    renderWithContexts(
      <NodeNextButton
        activeStep={activeStep}
        buttonText={buttonText}
        onClick={onClick}
        onNext={onNext}
        triggerNext={triggerNext}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(activeStep);
  });

  test('onNext triggered when triggerNext counter incremented', () => {
    onNext.mockClear();
    const { rerender } = renderWithContexts(
      <NodeNextButton
        activeStep={activeStep}
        buttonText={buttonText}
        onClick={onClick}
        onNext={onNext}
        triggerNext={triggerNext}
      />
    );
    rerender(
      <NodeNextButton
        activeStep={activeStep}
        buttonText={buttonText}
        onClick={onClick}
        onNext={onNext}
        triggerNext={1}
      />
    );
    expect(onNext).toHaveBeenCalled();
  });
});
