import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';

/**
 * Starts a build of a builder and opens its output, which is where a build is
 * watched from, as a launched job is.
 */
export default function useLaunchBuild(builderId: number) {
  const navigate = useNavigate();
  const {
    request: launch,
    isLoading: isLaunching,
    error: launchError,
  } = useRequest(
    useCallback(async () => {
      const { data: build } =
        await ExecutionEnvironmentBuildersAPI.launch(builderId);
      navigate(`/jobs/build/${build.id}/output`);
    }, [builderId, navigate])
  );
  const { error, dismissError } = useDismissableError(launchError);
  return { launch, isLaunching, error, dismissError };
}
