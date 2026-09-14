import React from 'react';

import { Spinner } from '@patternfly/react-core';
import './LoadingSpinner.css';

const LoadingSpinner = () => (
  <div className="awx-loading-spinner__updating-content">
    <Spinner />
  </div>
);
export default LoadingSpinner;
