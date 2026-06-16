import React from 'react';
import { render } from '@testing-library/react';
import { SortAlphaDownIcon, SortAlphaDownAltIcon, SortNumericDownIcon, SortNumericDownAltIcon } from '@patternfly/react-icons';

[['SortAlphaDownIcon',SortAlphaDownIcon],['SortAlphaDownAltIcon',SortAlphaDownAltIcon],['SortNumericDownIcon',SortNumericDownIcon],['SortNumericDownAltIcon',SortNumericDownAltIcon]].forEach(([n,Ic])=>{
  test(n, () => {
    const { container } = render(<Ic />);
    const d = container.querySelector('path').getAttribute('d');
    process.stdout.write(`ICON::${n}::len=${d.length}::${d}\n\n`);
  });
});
