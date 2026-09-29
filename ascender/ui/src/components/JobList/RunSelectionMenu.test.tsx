import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import RunSelectionMenu from './RunSelectionMenu';

/* The wizards are stood in for by what they are handed, which is all this
   menu decides: what a run is aimed at. */
vi.mock('./RunTemplateWizard', () => ({
  default: ({ limit }: { limit?: string }) => (
    <div data-testid="template-wizard">{`limit: ${limit}`}</div>
  ),
}));
vi.mock('components/AdHocCommands/AdHocCommandsFlow', () => ({
  default: ({ adHocItems }: { adHocItems: { name?: string }[] }) => (
    <div data-testid="command-flow">
      {`items: ${adHocItems.map((item) => item.name).join(',')}`}
    </div>
  ),
}));

const group = { id: 7, name: 'web' };

function renderMenu(
  props: Partial<React.ComponentProps<typeof RunSelectionMenu>>
) {
  return renderWithContexts(
    <RunSelectionMenu
      items={[]}
      inventoryId={1}
      moduleOptions={[]}
      onLaunchLoading={() => {}}
      {...props}
    />
  );
}

describe('<RunSelectionMenu />', () => {
  test('runs on the whole inventory where nothing is ticked and there is no scope', async () => {
    const { user } = renderMenu({});

    await user.hover(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Run on All')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('menuitem', { name: 'Job' }));
    expect(screen.getByTestId('template-wizard')).toHaveTextContent(
      'limit: all'
    );
  });

  /*
   * A list under one group or one host runs on that group or host with
   * nothing ticked, not on every host in the inventory.
   */
  test('runs on its scope where nothing is ticked', async () => {
    const { user } = renderMenu({
      scope: { item: group, label: 'Run on Group' },
    });

    await user.hover(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Run on Group')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('menuitem', { name: 'Job' }));
    expect(screen.getByTestId('template-wizard')).toHaveTextContent(
      'limit: web'
    );
  });

  test('hands the command form its scope where nothing is ticked', async () => {
    const { user } = renderMenu({
      scope: { item: group, label: 'Run on Group' },
    });

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('menuitem', { name: 'Command' }));
    expect(screen.getByTestId('command-flow')).toHaveTextContent('items: web');
  });

  test('runs on what is ticked over its scope', async () => {
    const { user } = renderMenu({
      items: [
        { id: 1, name: 'one' },
        { id: 2, name: 'two' },
      ],
      scope: { item: group, label: 'Run on Group' },
    });

    await user.hover(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Run on Selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('menuitem', { name: 'Job' }));
    expect(screen.getByTestId('template-wizard')).toHaveTextContent(
      'limit: one,two'
    );
  });
});
