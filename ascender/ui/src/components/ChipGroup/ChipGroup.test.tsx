import React from 'react';
import { Label } from '@patternfly/react-core';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ChipGroup from './ChipGroup';

describe('ChipGroup', () => {
  test('should show the collapsed-chip count', () => {
    renderWithContexts(
      <ChipGroup numChips={5} totalChips={10}>
        {Array.from({ length: 10 }, (v, i) => (
          <Label variant="outline" key={i}>{`chip ${i}`}</Label>
        ))}
      </ChipGroup>
    );
    expect(screen.getByText('5 more')).toBeInTheDocument();
  });
});
