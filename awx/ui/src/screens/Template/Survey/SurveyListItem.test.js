import React from 'react';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SurveyListItem from './SurveyListItem';

const renderInTable = (ui) =>
  renderWithContexts(
    <table>
      <tbody>{ui}</tbody>
    </table>
  );

// Mirrors how the app mounts the list: Template.js routes "survey/*" to
// TemplateSurvey, which renders SurveyList from its own index route. Relative
// link targets resolve against that route path, so hrefs are only meaningful
// when the item is mounted at the same depth.
const renderAtSurveyRoute = (ui) =>
  renderWithContexts(
    <Routes>
      <Route
        path="/templates/:templateType/:id/survey/*"
        element={
          <Routes>
            <Route
              index
              element={
                <table>
                  <tbody>{ui}</tbody>
                </table>
              }
            />
          </Routes>
        }
      />
    </Routes>,
    {
      context: {
        router: {
          history: createMemoryHistory({
            initialEntries: ['/templates/job_template/59/survey'],
          }),
        },
      },
    }
  );

describe('<SurveyListItem />', () => {
  const item = {
    question_name: 'Foo',
    variable: 'buzz',
    default: 'Bar',
    type: 'text',
    id: 1,
  };

  test('renders successfully', () => {
    renderInTable(
      <SurveyListItem question={item} isFirst={false} isLast={false} />
    );
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('fields are rendering properly', () => {
    renderInTable(
      <SurveyListItem question={item} isFirst={false} isLast={false} canEdit />
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select all rows' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('cell')).toHaveLength(4);
  });

  test('required item has required asterisk', () => {
    const newItem = {
      question_name: 'Foo',
      default: 'Bar',
      type: 'text',
      id: 1,
      required: true,
    };

    renderInTable(
      <SurveyListItem
        question={newItem}
        isChecked={false}
        isFirst
        isLast
        canEdit
      />
    );
    expect(screen.getByLabelText('Required')).toBeInTheDocument();
  });

  test('items that are not required should not have an asterisk', () => {
    renderInTable(
      <SurveyListItem
        question={item}
        isChecked={false}
        isFirst
        isLast
        canEdit
      />
    );
    expect(screen.queryByLabelText('Required')).not.toBeInTheDocument();
  });

  test('multiselect default renders read-only chips', () => {
    const newItem = {
      question_name: 'Foo',
      default: 'a\nd\nb\ne\nf\ng\nh\ni\nk',
      type: 'multiselect',
      id: 1,
    };

    renderInTable(
      <SurveyListItem
        question={newItem}
        isChecked={false}
        isFirst
        isLast
        canEdit
      />
    );
    // numChips=5 + 1 overflow chip => 6 list items in the chip group.
    // PF renders each chip as a list item; the overflow chip is the "4 more"
    // toggle. The five visible chips are read-only (no close button).
    const chips = screen.getAllByRole('listitem');
    expect(chips).toHaveLength(6);
    ['a', 'd', 'b', 'e', 'f'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
      // read-only chips have no remove button
      expect(
        screen.queryByRole('button', { name: `Remove ${label}` })
      ).not.toBeInTheDocument();
    });
    // overflow chip toggle present
    expect(screen.getByText('4 more')).toBeInTheDocument();
  });

  test('password default renders ENCRYPTED', () => {
    const newItem = {
      question_name: 'Foo',
      default: '$encrypted$',
      type: 'password',
      id: 1,
    };

    renderInTable(
      <SurveyListItem
        question={newItem}
        isChecked={false}
        isFirst
        isLast
        canEdit
      />
    );
    expect(screen.getByText('ENCRYPTED')).toBeInTheDocument();
  });

  test('users without edit/delete permissions are unable to reorder the questions', () => {
    renderInTable(
      <SurveyListItem canEdit={false} question={item} isChecked={false} />
    );
    expect(
      screen.queryByRole('button', { name: 'move up' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'move down' })
    ).not.toBeInTheDocument();
    // No edit (pencil) button is rendered without edit capabilities.
    expect(
      document.querySelector('[data-ouia-component-id="edit-survey-buzz"]')
    ).toBeNull();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderAtSurveyRoute(
      <SurveyListItem
        question={item}
        isFirst
        isLast
        isChecked={false}
        canEdit
      />
    );

    const editLink = document.querySelector(
      '[data-ouia-component-id="edit-survey-buzz"]'
    );
    expect(editLink).toBeInTheDocument();
    expect(editLink).toHaveAttribute(
      'href',
      '/templates/job_template/59/survey/edit?question_variable=buzz'
    );
  });

  test('question name links to the edit form for that question', () => {
    renderAtSurveyRoute(
      <SurveyListItem
        question={item}
        isFirst
        isLast
        isChecked={false}
        canEdit
      />
    );

    expect(screen.getByRole('link', { name: 'Foo' })).toHaveAttribute(
      'href',
      '/templates/job_template/59/survey/edit?question_variable=buzz'
    );
  });
});
