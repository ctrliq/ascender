import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

export interface AppendBodyProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

function AppendBody({ children }: AppendBodyProps) {
  const [el] = useState(document.createElement('div'));

  useEffect(() => {
    document.body.appendChild(el);
    return () => {
      document.body.removeChild(el);
    };
  }, [el]);

  return ReactDOM.createPortal(children, el);
}

export default AppendBody;
