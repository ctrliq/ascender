import React from 'react';
import { Link } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../testUtils/rtlContexts';
import ActivityStreamDetailButton from './ActivityStreamDetailButton';

jest.mock('../../api/models/ActivityStream');

describe('<ActivityStreamDetailButton />', () => {
  test('initially renders successfully', () => {
    renderWithContexts(
      <ActivityStreamDetailButton
        streamItem={{
          timestamp: '12:00:00',
        }}
        user={<Link to="/users/1/details">Bob</Link>}
        description={<span>foo</span>}
      />
    );
    expect(
      screen.getByRole('button', { name: 'View event details' })
    ).toBeInTheDocument();
  });

  test('details are properly rendered', async () => {
    const { user } = renderWithContexts(
      <ActivityStreamDetailButton
        streamItem={{
          summary_fields: {
            actor: {
              id: 1,
              username: 'Bob',
              first_name: '',
              last_name: '',
            },
            setting: [
              {
                category: 'system',
                name: 'INSIGHTS_TRACKING_STATE',
              },
            ],
          },
          timestamp: '2021-05-25T18:17:59.835788Z',
          operation: 'create',
          changes: {
            value: false,
            id: 6,
          },
          object1: 'setting',
          object2: '',
          object_association: '',
          action_node: 'awx_1',
          object_type: '',
        }}
        user={<Link to="/users/1/details">Bob</Link>}
        description={<span>foo</span>}
      />
    );

    // the modal is closed initially
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'View event details' })
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: 'Event detail' })
    ).toBeInTheDocument();

    assertDetail('Time', '5/25/2021, 6:17:59 PM');
    assertDetail('Initiated by', 'Bob');
    assertDetail('Setting category', 'system');
    assertDetail('Setting name', 'INSIGHTS_TRACKING_STATE');
    assertDetail('Action', 'foo');

    // the changes payload is rendered into a read-only code editor. The Ace
    // editor keeps its text in an internal model that does not surface as DOM
    // text under jsdom (the value is held on the CodeEditor `value`
    // prop, which RTL cannot reach), so assert the editor is present and that
    // VariablesDetail detected the JSON changes object and engaged JSON mode --
    // the active mode button is the PF "primary" variant.
    const editorInput = document.getElementById(
      'activity-stream-detail-changes-preview'
    );
    expect(editorInput).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'JSON' })).toHaveClass(
      'pf-m-primary'
    );
    expect(within(dialog).getByRole('button', { name: 'YAML' })).toHaveClass(
      'pf-m-secondary'
    );
  });
});
