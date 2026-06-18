import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import RunStep from './RunStep';

// SelectableCard does not forward `id`/`isSelected` to the DOM; selection is
// expressed only through styled-components classes ($isSelected). The cards are
// role="button" elements identified by their label text. Cards in the same
// selection state share a generated class, so we assert selection by comparing
// each card's class against the success card while it is the default-selected
// one.
function getCard(label) {
  return screen.getByText(label).closest('[role="button"]');
}

describe('RunStep', () => {
  test('Default selected card matches default link type when present', () => {
    renderWithContexts(
      <Formik initialValues={{ linkType: 'success' }}>
        <RunStep />
      </Formik>
    );
    const success = getCard('On Success');
    const failure = getCard('On Failure');
    const always = getCard('Always');
    // the selected card has a distinct generated class from the unselected ones
    expect(success.className).not.toBe(failure.className);
    expect(failure.className).toBe(always.className);
  });

  test('Clicking always card makes expected callback', async () => {
    renderWithContexts(
      <Formik initialValues={{ linkType: 'success' }}>
        <RunStep />
      </Formik>
    );
    // class carried by the currently-selected (success) card
    const selectedClass = getCard('On Success').className;
    expect(getCard('Always').className).not.toBe(selectedClass);
    await act(async () => {
      fireEvent.click(getCard('Always'));
    });
    // after selecting, the always card now carries the selected class and
    // success becomes unselected
    expect(getCard('Always').className).toBe(selectedClass);
    expect(getCard('On Success').className).not.toBe(selectedClass);
  });

  test('Clicking failure card makes expected callback', async () => {
    renderWithContexts(
      <Formik initialValues={{ linkType: 'success' }}>
        <RunStep />
      </Formik>
    );
    const selectedClass = getCard('On Success').className;
    expect(getCard('On Failure').className).not.toBe(selectedClass);
    await act(async () => {
      fireEvent.click(getCard('On Failure'));
    });
    expect(getCard('On Failure').className).toBe(selectedClass);
    expect(getCard('On Success').className).not.toBe(selectedClass);
  });
});
