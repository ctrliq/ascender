import React from 'react';
import { render } from '@testing-library/react';
import { Table, Tbody, Tr } from '@patternfly/react-table';
import ActionsTd from './ActionsTd';
import ActionItem from './ActionItem';

function renderRow(showFirst: boolean) {
  return render(
    <Table aria-label="actions">
      <Tbody>
        <Tr>
          <ActionsTd dataLabel="Actions">
            <ActionItem visible={showFirst}>
              <button type="button">sync</button>
            </ActionItem>
            <ActionItem visible>
              <button type="button">edit</button>
            </ActionItem>
            {showFirst && <span>extra</span>}
          </ActionsTd>
        </Tr>
      </Tbody>
    </Table>
  );
}

describe('<ActionsTd />', () => {
  test('gives every action a slot, the hidden ones included', () => {
    const { container } = renderRow(false);

    // The hidden sync action and the absent extra keep their slots, so the
    // edit button stays in the second one, where it is on a row that has all.
    const slots = container.querySelectorAll('.ascender-actions-td__slot');
    expect(slots).toHaveLength(3);
    expect(slots[0]).toBeEmptyDOMElement();
    expect(slots[1]).toHaveTextContent('edit');
    expect(slots[2]).toBeEmptyDOMElement();
  });

  test('puts each action in the slot of its position', () => {
    const { container } = renderRow(true);

    const slots = container.querySelectorAll('.ascender-actions-td__slot');
    expect(slots).toHaveLength(3);
    expect(slots[0]).toHaveTextContent('sync');
    expect(slots[1]).toHaveTextContent('edit');
    expect(slots[2]).toHaveTextContent('extra');
  });
});
