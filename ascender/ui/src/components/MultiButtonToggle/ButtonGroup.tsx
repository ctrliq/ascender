import React from 'react';
import './ButtonGroup.css';

export interface ButtonGroupProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

function ButtonGroup({ children }: ButtonGroupProps) {
  return <div className="ascender-button-group__group">{children}</div>;
}

export default ButtonGroup;
