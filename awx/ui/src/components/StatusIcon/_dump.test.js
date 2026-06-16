import React from 'react';
import { render } from '@testing-library/react';
import StatusIcon from 'components/StatusIcon';

['successful','running','waiting','failed','ok','changed','skipped','unreachable'].forEach((s) => {
  test(`dump-${s}`, () => {
    const { container } = render(<StatusIcon status={s} />);
    const svg = container.querySelector('svg');
    const path = svg.querySelector('path').getAttribute('d');
    // eslint-disable-next-line no-console
    console.log(`${s} :: viewBox=${svg.getAttribute('viewBox')} :: d.start=${path.slice(0,30)}`);
  });
});
