import React from 'react';
import { createMemoryHistory } from 'history';
import { act } from 'react-dom/test-utils';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';

import Applications from './Applications';

jest.mock('../../api/models/Applications');
jest.mock('../../api/models/Organizations');

describe('<Applications />', () => {
  let wrapper;

  test('renders successfully', () => {
    wrapper = mountWithContexts(<Applications />);
    const pageSections = wrapper.find('PageSection');
    expect(wrapper.length).toBe(1);
    expect(pageSections.length).toBe(1);
    expect(pageSections.first().props().variant).toBe('light');
  });

  test('shows Application information modal after successful creation', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/applications/add'],
    });
    await act(async () => {
      wrapper = mountWithContexts(<Applications />, {
        context: { router: { history } },
      });
    });
    
    expect(wrapper.find('Modal[title="Application information"]').length).toBe(
      0
    );
    
    await act(async () => {
      wrapper.find('ApplicationAdd').props().onSuccessfulAdd({
        name: 'test',
        client_id: 'foobar',
        client_secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaa',
      });
    });
    
    wrapper.update();
    expect(wrapper.find('Modal[title="Application information"]').length).toBe(
      1
    );
  });
});
