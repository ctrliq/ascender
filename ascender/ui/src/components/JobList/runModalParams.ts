import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { removeNamespaces } from 'util/qs';
import LAUNCH_PROMPT_NAMESPACES from 'components/LaunchPrompt/namespaces';
import ADHOC_NAMESPACES from 'components/AdHocCommands/namespaces';

/**
 * The lists a run's modals hold, by the namespace each of them pages under.
 *
 * What a list writes into the address is how it survives a page turn, and a
 * list inside a modal has no way of knowing the modal has gone: the search
 * typed into one would filter the next modal opened, with nothing on screen
 * to say why. Every one of these is prefixed, so the lists behind the modals,
 * the inventories list under `inventory` and the credentials list under
 * `credential` among them, are never what is forgotten.
 */
export const RUN_MODAL_NAMESPACES = [
  'run-target',
  'run-template',
  'launch-pick',
  ...Object.values(LAUNCH_PROMPT_NAMESPACES),
  ...Object.values(ADHOC_NAMESPACES),
];

/**
 * Forgets what a modal's lists were showing, for the next one to open fresh.
 *
 * Args:
 *     namespaces: The namespaces the modal's lists page under.
 *
 * Returns:
 *     A callback that drops those namespaces from the address, in place, and
 *     does nothing where none of them is there.
 */
export function useForgetModalParams(namespaces: string[]) {
  const location = useLocation();
  const navigate = useNavigate();
  return useCallback(() => {
    const search = removeNamespaces(location.search, namespaces);
    if (search === location.search.replace(/^\?/, '')) {
      return;
    }
    // In place: closing a modal is not somewhere the back button goes.
    navigate(search ? `${location.pathname}?${search}` : location.pathname, {
      replace: true,
    });
  }, [location, navigate, namespaces]);
}

/** Forgets what a run's modals were showing, for the next one to open fresh. */
export default function useForgetRunModalParams() {
  return useForgetModalParams(RUN_MODAL_NAMESPACES);
}
