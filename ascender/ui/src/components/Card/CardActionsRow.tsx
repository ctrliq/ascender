import React from 'react';
import './CardActionsRow.css';

export interface CardActionsRowProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

function CardActionsRow({ children }: CardActionsRowProps) {
  return <div className="awx-card-actions-row__wrapper">{children}</div>;
}

export default CardActionsRow;
