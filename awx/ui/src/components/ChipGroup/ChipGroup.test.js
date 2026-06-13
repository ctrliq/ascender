import React from 'react';
import { Chip } from '@patternfly/react-core';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ChipGroup from './ChipGroup';

describe('ChipGroup', () => {
  test('should show the collapsed-chip count', () => {
    renderWithContexts(
      <ChipGroup numChips={5} totalChips={10}>
        {Array.from({ length: 10 }, (v, i) => (
          <Chip key={i}>{`chip ${i}`}</Chip>
        ))}
      </ChipGroup>
    );
    expect(screen.getByText('5 more')).toBeInTheDocument();
  });
});
