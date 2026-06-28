import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { SchedulesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ScheduleList from './ScheduleList';
import mockSchedules from '../data.schedules.json';

jest.mock('../../../api');

let loadSchedules;
let loadScheduleOptions;

function setupMocks() {
  SchedulesAPI.destroy = jest.fn();
  SchedulesAPI.update.mockResolvedValue({
    data: mockSchedules.results[0],
  });
  SchedulesAPI.read.mockResolvedValue({ data: mockSchedules });
  SchedulesAPI.readOptions.mockResolvedValue({
    data: { actions: { GET: {}, POST: {} } },
  });
  loadSchedules = jest.fn().mockResolvedValue({ data: mockSchedules });
  loadScheduleOptions = jest.fn().mockResolvedValue({
    data: { actions: { GET: {}, POST: {} } },
  });
}

function renderList(props) {
  return renderWithContexts(
    <ScheduleList
      loadSchedules={loadSchedules}
      loadScheduleOptions={loadScheduleOptions}
      resource={{ type: 'job_template', inventory: 1 }}
      launchConfig={{ survey_enabled: false }}
      surveyConfig={{}}
      {...props}
    />
  );
}

// row-selection checkboxes carry an aria-label of "Select row N"; the toggle
// switches are also checkboxes, so filter to selection inputs only
const rowSelectCheckboxes = () =>
  screen
    .getAllByRole('checkbox')
    .filter((box) =>
      (box.getAttribute('aria-label') || '').startsWith('Select row')
    );

const selectCheckboxInRow = (row) =>
  within(row)
    .getAllByRole('checkbox')
    .find((box) =>
      (box.getAttribute('aria-label') || '').startsWith('Select row')
    );

describe('ScheduleList', () => {
  describe('read call successful', () => {
    beforeEach(() => {
      setupMocks();
    });

    test('should fetch schedules from api and render the list', async () => {
      renderList();
      await screen.findByRole('link', { name: 'Mock JT Schedule' });
      expect(loadSchedules).toHaveBeenCalled();
      // five schedules => five name links
      expect(
        screen.getAllByRole('link', { name: /Mock .* Schedule/ })
      ).toHaveLength(5);
    });

    test('should show add button', async () => {
      renderList();
      expect(
        await screen.findByRole('link', { name: 'Add' })
      ).toBeInTheDocument();
    });

    test('should check and uncheck the row item', async () => {
      const { user } = renderList();
      await screen.findByRole('link', { name: 'Mock JT Schedule' });
      const row = screen
        .getByRole('link', { name: 'Mock JT Schedule' })
        .closest('tr');
      const checkbox = selectCheckboxInRow(row);

      expect(checkbox).not.toBeChecked();
      await user.click(checkbox);
      expect(checkbox).toBeChecked();
      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    test('should check all row items when select all is checked', async () => {
      const { user } = renderList();
      await screen.findByRole('link', { name: 'Mock JT Schedule' });
      const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
      const boxes = rowSelectCheckboxes();
      expect(boxes).toHaveLength(5);
      boxes.forEach((box) => expect(box).not.toBeChecked());

      await user.click(selectAll);
      rowSelectCheckboxes().forEach((box) => expect(box).toBeChecked());

      await user.click(selectAll);
      rowSelectCheckboxes().forEach((box) => expect(box).not.toBeChecked());
    });

    test('should call api delete schedules for each selected schedule', async () => {
      SchedulesAPI.destroy.mockResolvedValue({});
      const { user } = renderList();
      await screen.findByRole('link', { name: 'Mock System Job Schedule' });
      const row = screen
        .getByRole('link', { name: 'Mock System Job Schedule' })
        .closest('tr');
      await user.click(selectCheckboxInRow(row));

      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('button', { name: 'confirm delete' })
      );

      await waitFor(() => expect(SchedulesAPI.destroy).toHaveBeenCalledTimes(1));
    });

    test('should show error modal when schedule is not successfully deleted from api', async () => {
      SchedulesAPI.destroy.mockRejectedValueOnce(new Error());
      const { user } = renderList();
      await screen.findByRole('link', { name: 'Mock Project Update Schedule' });
      const row = screen
        .getByRole('link', { name: 'Mock Project Update Schedule' })
        .closest('tr');
      await user.click(selectCheckboxInRow(row));

      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('button', { name: 'confirm delete' })
      );

      expect(await screen.findByText('Error!')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() =>
        expect(screen.queryByText('Error!')).not.toBeInTheDocument()
      );
    });

    test('should call api update schedules when toggle clicked', async () => {
      const { user } = renderList();
      await screen.findByRole('link', { name: 'Mock Inventory Update Schedule' });
      const toggle = document.querySelector('#schedule-5-toggle');
      await user.click(toggle);
      await waitFor(() => expect(SchedulesAPI.update).toHaveBeenCalledTimes(1));
    });

    test('should show error modal when schedule is not successfully updated on toggle', async () => {
      SchedulesAPI.update.mockRejectedValueOnce(new Error());
      const { user } = renderList();
      await screen.findByRole('link', { name: 'Mock JT Schedule' });
      const toggle = document.querySelector('#schedule-1-toggle');
      await user.click(toggle);

      expect(await screen.findByText('Error!')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() =>
        expect(screen.queryByText('Error!')).not.toBeInTheDocument()
      );
    });
  });

  describe('hidden add button', () => {
    beforeEach(() => {
      setupMocks();
    });

    test('should hide add button when flag is passed', async () => {
      renderList({ hideAddButton: true });
      await screen.findByRole('link', { name: 'Mock JT Schedule' });
      expect(
        screen.queryByRole('link', { name: 'Add' })
      ).not.toBeInTheDocument();
    });

    test('should show missing survey icon and disabled toggle', async () => {
      renderList({
        hideAddButton: true,
        resource: { type: 'job_template', inventory: 1 },
        launchConfig: { survey_enabled: true },
        surveyConfig: { spec: [{ required: true, default: null }] },
      });
      await screen.findByRole('link', { name: 'Mock Inventory Update Schedule' });
      // schedule 5 is missing required survey values -> its toggle is disabled
      expect(document.querySelector('#schedule-5-toggle')).toBeDisabled();
      // a warning icon is rendered for each row that is missing survey values
      const warningIcons = document.querySelectorAll(
        'td[data-label="Name"] .pf-v6-svg'
      );
      expect(warningIcons.length).toBe(5);
    });

    test('should show missing inventory icon and disabled toggle', async () => {
      renderList({
        hideAddButton: true,
        resource: { type: 'job_template' },
        launchConfig: {
          survey_enabled: true,
          inventory_needed_to_start: true,
        },
        surveyConfig: { spec: [] },
      });
      await screen.findByRole('link', { name: 'Mock System Job Schedule' });
      // schedule 3 is missing an inventory -> its toggle is disabled
      expect(document.querySelector('#schedule-3-toggle')).toBeDisabled();
      const warningIcons = document.querySelectorAll(
        'td[data-label="Name"] .pf-v6-svg'
      );
      expect(warningIcons.length).toBe(4);
    });
  });

  describe('read call unsuccessful', () => {
    test('should show content error when read call unsuccessful', async () => {
      setupMocks();
      loadSchedules.mockRejectedValue(new Error());
      renderList();
      expect(
        await screen.findByText('Something went wrong...')
      ).toBeInTheDocument();
    });
  });
});
