//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React from 'react';

import { BackgroundImage } from '@patternfly/react-core';

export default ({ children }) => (
  <>
    <BackgroundImage src="/static/media/CIQ_grayscale_bkgd.jpg" />
    {children}
  </>
);
