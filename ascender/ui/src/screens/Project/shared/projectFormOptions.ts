import type { OptionsField, SummaryFieldRef } from 'types/api';
import { CredentialTypesAPI, ProjectsAPI } from 'api';
import type { ProjectCredentials } from './ProjectForm';

/**
 * What the project form needs before it can draw, none of it about a project.
 *
 * The two credential type ids and the source control choices are the same for
 * every project on an installation, which is why the screen reads them: read in
 * the form, they arrived after the page had drawn and the form replaced itself
 * with a second loading animation while they were on their way.
 */
export interface ProjectFormOptions {
  /** The id of the source control credential type. */
  scmCredentialTypeId: number | null;
  /** The id of the cryptography credential type, for signature validation. */
  cryptographyCredentialTypeId: number | null;
  /** What a project's scm_type may be, as the api lists them. */
  scmTypeChoices: OptionsField['choices'];
}

/**
 * Reads what the project form needs before it can draw.
 *
 * Returns:
 *     The two credential type ids and the source control type choices.
 */
export async function readProjectFormOptions(): Promise<ProjectFormOptions> {
  const [
    {
      data: {
        results: [scmCredentialType],
      },
    },
    {
      data: {
        results: [cryptographyCredentialType],
      },
    },
    { data: options },
  ] = await Promise.all([
    CredentialTypesAPI.read({ kind: 'scm' }),
    CredentialTypesAPI.read({ kind: 'cryptography' }),
    ProjectsAPI.readOptions(),
  ]);

  return {
    scmCredentialTypeId: scmCredentialType?.id ?? null,
    cryptographyCredentialTypeId: cryptographyCredentialType?.id ?? null,
    scmTypeChoices: options.actions.GET?.scm_type?.choices ?? [],
  };
}

/**
 * Sorts a credential into the slot its own type belongs to.
 *
 * A project names one credential for source control and one for signature
 * validation, and the form asks for each by type: this says which of the two
 * slots the credential on the project fills, and leaves the other empty.
 *
 * Args:
 *     options: The credential type ids, as read above.
 *     credential: The credential the project carries, if it carries one.
 *
 * Returns:
 *     Both slots, each with its type id and whichever credential matches it.
 */
export function sortCredential(
  options: ProjectFormOptions,
  credential?: SummaryFieldRef
): ProjectCredentials {
  const { scmCredentialTypeId, cryptographyCredentialTypeId } = options;
  if (!credential) {
    return {
      scm: { typeId: scmCredentialTypeId, value: null },
      cryptography: { typeId: cryptographyCredentialTypeId, value: null },
    };
  }

  const { credential_type_id } = credential;
  return {
    scm: {
      typeId: scmCredentialTypeId,
      value: credential_type_id === scmCredentialTypeId ? credential : null,
    },
    cryptography: {
      typeId: cryptographyCredentialTypeId,
      value:
        credential_type_id === cryptographyCredentialTypeId ? credential : null,
    },
  };
}
