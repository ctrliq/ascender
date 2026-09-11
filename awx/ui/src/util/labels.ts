import { LabelsAPI, OrganizationsAPI } from '../api';
import type { Label, Organization, Paginated } from '../types/api';

/** A label as a form supplies it: existing ones carry a numeric id, new ones do not. */
interface LabelInput {
  id?: number | string;
  name: string;
}

async function createNewLabels(
  labels: LabelInput[] = [],
  organization: number | null = null
): Promise<{ labelIds: number[]; error: unknown }> {
  let error: unknown = null;
  const labelIds: number[] = [];

  try {
    const newLabels: LabelInput[] = [];
    const labelRequests: Promise<void>[] = [];
    let organizationId = organization;
    if (labels) {
      labels.forEach((label) => {
        if (typeof label.id !== 'number') {
          newLabels.push(label);
        } else {
          labelIds.push(label.id as number);
        }
      });
    }

    if (newLabels.length > 0) {
      if (!organizationId) {
        // eslint-disable-next-line no-useless-catch
        try {
          const { data } = await OrganizationsAPI.read();
          const { results } = data as Paginated<Organization>;
          organizationId = results[0]?.id ?? null;
        } catch (err) {
          throw err;
        }
      }
    }

    newLabels.forEach((label) => {
      labelRequests.push(
        LabelsAPI.create({
          name: label.name,
          organization: organizationId,
        }).then(({ data }) => {
          labelIds.push((data as Label).id);
        })
      );
    });

    await Promise.all(labelRequests);
  } catch (err) {
    error = err;
  }

  return {
    labelIds,
    error,
  };
}

export default createNewLabels;
