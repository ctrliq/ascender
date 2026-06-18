import React from 'react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../testUtils/rtlContexts';

import DetailList from './DetailList';
import Detail from './Detail';

describe('DetailList', () => {
  test('renders the expected content', () => {
    renderWithContexts(
      <DetailList>
        <Detail label="foo" value="bar" />
      </DetailList>
    );
    assertDetail('foo', 'bar');
  });
});
