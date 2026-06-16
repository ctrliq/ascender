import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ActivityStreamListItem from './ActivityStreamListItem';

jest.mock('../../api/models/ActivityStream');

describe('<ActivityStreamListItem />', () => {
  test('initially renders successfully', () => {
    renderWithContexts(
      <table>
        <tbody>
          <ActivityStreamListItem
            streamItem={{
              timestamp: '12:00:00',
            }}
            onSelect={() => {}}
          />
        </tbody>
      </table>
    );
    expect(screen.getByRole('row')).toBeInTheDocument();
  });
});
