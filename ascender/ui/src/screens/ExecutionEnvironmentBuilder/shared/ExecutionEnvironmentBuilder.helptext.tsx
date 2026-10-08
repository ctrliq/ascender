import { useLingui } from '@lingui/react/macro';

function useExecutionEnvironmentBuilderHelpTextStrings() {
  const { t } = useLingui();
  return {
    image: t`The image to tag the built execution environment as and push it to, including the container registry but not the tag. For example: quay.io/my-org/my-ee`,
    tag: t`The tag to give the built image.`,
    project: t`The project that holds the ansible-builder definition file.`,
    executionEnvironmentFile: t`The ansible-builder definition file to build, a version 3 execution-environment.yml from the project. A source control project lists the files its last sync found.`,
    registryCredential: t`Credential for the container registry the image is pushed to.`,
    organization: t`The organization whose execution environment admins can manage and run this builder.`,
  };
}

export default useExecutionEnvironmentBuilderHelpTextStrings;
