import type { ActivityStreamEntry, SummaryFieldRef } from 'types/api';
import React from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';

const buildAnchor = (
  obj: SummaryFieldRef,
  resource: string,
  activity: ActivityStreamEntry
) => {
  let url;
  let name;
  // Both are read unguarded on purpose: the stream names every object as a
  // list, and reaching for one it did not name throws into the catch below,
  // which is what falls back to the resource's plain name.
  const named = (key: string) =>
    (
      activity.summary_fields[key] as SummaryFieldRef[]
    )[0] as SummaryFieldRef & {
      username?: string;
      inventory_id?: number;
    };
  const changes = (activity.changes ?? {}) as Record<string, string>;
  // try/except pattern asserts that:
  // if we encounter a case where a UI url can't or
  // shouldn't be generated, just supply the name of the resource
  try {
    // catch-all case to avoid generating urls if a resource has been deleted
    // if a resource still exists, it'll be serialized in the activity's summary_fields
    if (!activity.summary_fields[resource]) {
      throw new Error('The referenced resource no longer exists');
    }
    switch (resource) {
      case 'custom_inventory_script':
        url = `/inventory_scripts/${obj.id}/`;
        break;
      case 'group':
        if (
          activity.operation === 'create' ||
          activity.operation === 'delete'
        ) {
          // the API formats the changes.inventory field as str 'myInventoryName-PrimaryKey'
          const [inventory_id] = (changes.inventory as string)
            .split('-')
            .slice(-1);
          url = `/inventories/inventory/${inventory_id}/groups/${changes.id}/details/`;
        } else {
          url = `/inventories/inventory/${named('inventory').id}/groups/${
            changes.id || changes.object1_pk
          }/details/`;
        }
        break;
      case 'host':
        url = `/hosts/${obj.id}/`;
        break;
      case 'job':
        url = `/jobs/${obj.id}/`;
        break;
      case 'inventory':
        url =
          obj?.kind === 'smart'
            ? `/inventories/smart_inventory/${obj.id}/`
            : `/inventories/inventory/${obj.id}/`;
        break;
      case 'schedule':
        // schedule urls depend on the resource they're associated with
        if (activity.summary_fields.job_template) {
          const jt_id = named('job_template').id;
          url = `/templates/job_template/${jt_id}/schedules/${obj.id}/`;
        } else if (activity.summary_fields.workflow_job_template) {
          const wfjt_id = named('workflow_job_template').id;
          url = `/templates/workflow_job_template/${wfjt_id}/schedules/${obj.id}/`;
        } else if (activity.summary_fields.project) {
          url = `/projects/${named('project').id}/schedules/${obj.id}/`;
        } else if (activity.summary_fields.system_job_template) {
          url = null;
        } else if (activity.summary_fields.inventory_source) {
          const invSource = named('inventory_source');
          url = invSource.inventory_id
            ? `/inventories/inventory/${invSource.inventory_id}/sources/${invSource.id}/schedules/${obj.id}/`
            : null;
        } else {
          // urls for inventory sync schedules currently depend on having
          // an inventory id and group id
          throw new Error(
            'activity.summary_fields to build this url not implemented yet'
          );
        }
        break;
      case 'setting':
        url = `/settings/`;
        break;
      case 'notification_template':
        url = `/notification_templates/${obj.id}/`;
        break;
      case 'role':
        throw new Error(
          'role object management is not consolidated to a single UI view'
        );
      case 'job_template':
        url = `/templates/job_template/${obj.id}/`;
        break;
      case 'workflow_job_template':
        url = `/templates/workflow_job_template/${obj.id}/`;
        break;
      case 'workflow_job_template_node': {
        const { id: wfjt_id, name: wfjt_name } = named('workflow_job_template');
        url = `/templates/workflow_job_template/${wfjt_id}/`;
        name = wfjt_name;
        break;
      }
      case 'workflow_job':
        url = `/jobs/workflow/${obj.id}/`;
        break;
      case 'label':
        url = null;
        break;
      case 'inventory_source': {
        const inventoryId = String(obj.inventory ?? '')
          .split('-')
          .reverse()[0];
        url = `/inventories/inventory/${inventoryId}/sources/${obj.id}/details/`;
        break;
      }
      case 'o_auth2_application':
        url = `/applications/${obj.id}/`;
        break;
      case 'workflow_approval':
        url = `/jobs/workflow/${named('workflow_job').id}/output/`;
        name = `${named('workflow_job').name} | ${named('workflow_approval').name}`;
        break;
      case 'workflow_approval_template':
        url = `/templates/workflow_job_template/${named('workflow_job_template').id}/visualizer/`;
        name = `${named('workflow_job_template').name} | ${
          named('workflow_approval_template').name
        }`;
        break;
      default:
        url = `/${resource}s/${obj.id}/`;
    }

    name = name || obj.name || (obj as { username?: string }).username;

    if (url) {
      return <Link to={url}>{name}</Link>;
    }

    return <span>{name}</span>;
  } catch (err) {
    return (
      <span>{obj.name || (obj as { username?: string }).username || ''}</span>
    );
  }
};

const getPastTense = (item: string) =>
  /e$/.test(item) ? `${item}d` : `${item}ed`;

const isGroupRelationship = (item: ActivityStreamEntry) =>
  item.object1 === 'group' &&
  item.object2 === 'group' &&
  ((item.summary_fields.group as SummaryFieldRef[]) ?? []).length > 1;

const buildLabeledLink = (label: React.ReactNode, link: React.ReactNode) => (
  <span>
    {label} {link}
  </span>
);

export interface ActivityStreamDescriptionProps {
  activity: ActivityStreamEntry;
  [key: string]: unknown;
}

function ActivityStreamDescription({
  activity,
}: ActivityStreamDescriptionProps) {
  const { t } = useLingui();
  // Every object the stream names comes as a list, because an association
  // names two of them; a branch below only reaches for one it has tested for.
  const named = (key: string, index = 0) =>
    ((activity.summary_fields[key] as SummaryFieldRef[]) ?? [])[
      index
    ] as SummaryFieldRef & { role_field?: string };
  // A created or deleted object is named by no summary field, because it does
  // not exist on one side of the entry: what names it there is the change
  // set, which buildAnchor reads for the same id and name.
  const changes = (activity.changes ?? {}) as SummaryFieldRef & {
    status?: [string, string];
    timed_out?: [boolean, boolean];
  };
  const labeledLinks = [];
  // Activity stream objects will outlive the resources they reference
  // in that case, summary_fields will not be available - show generic error text instead
  try {
    switch (activity.object_association) {
      // explicit role dis+associations
      case 'role': {
        // Both are set on a role association; the catch below is what covers
        // an entry whose objects the api no longer names.
        let object1 = activity.object1 as string;
        let object2 = activity.object2 as string;

        // if object1 winds up being the role's resource, we need to swap the objects
        // in order to make the sentence make sense.
        if (activity.object_type === object1) {
          object1 = activity.object2 as string;
          object2 = activity.object1 as string;
        }

        // object1 field is resource targeted by the dis+association
        // object2 field is the resource the role is inherited from
        // summary_field.role[0] contains ref info about the role
        switch (activity.operation) {
          // expected outcome: "disassociated <object2> role_name from <object1>"
          case 'disassociate':
            if (isGroupRelationship(activity)) {
              labeledLinks.push(
                buildLabeledLink(
                  getPastTense(activity.operation as string),
                  buildAnchor(named('group', 1), object2, activity)
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `${named('role').role_field} from`,
                  buildAnchor(named('group'), object1, activity)
                )
              );
            } else {
              labeledLinks.push(
                buildLabeledLink(
                  getPastTense(activity.operation as string),
                  buildAnchor(
                    (
                      activity.summary_fields[object2] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    object2,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `${named('role').role_field} from`,
                  buildAnchor(
                    (
                      activity.summary_fields[object1] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    object1,
                    activity
                  )
                )
              );
            }
            break;
          // expected outcome: "associated <object2> role_name to <object1>"
          case 'associate':
            if (isGroupRelationship(activity)) {
              labeledLinks.push(
                buildLabeledLink(
                  getPastTense(activity.operation as string),
                  buildAnchor(named('group', 1), object2, activity)
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `${named('role').role_field} to`,
                  buildAnchor(named('group'), object1, activity)
                )
              );
            } else {
              labeledLinks.push(
                buildLabeledLink(
                  getPastTense(activity.operation as string),
                  buildAnchor(
                    (
                      activity.summary_fields[object2] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    object2,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `${named('role').role_field} to`,
                  buildAnchor(
                    (
                      activity.summary_fields[object1] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    object1,
                    activity
                  )
                )
              );
            }
            break;
          default:
            break;
        }
        break;
        // inherited role dis+associations (logic identical to case 'role')
      }
      case 'parents':
        // object1 field is resource targeted by the dis+association
        // object2 field is the resource the role is inherited from
        // summary_field.role[0] contains ref info about the role
        switch (activity.operation) {
          // expected outcome: "disassociated <object2> role_name from <object1>"
          case 'disassociate':
            if (isGroupRelationship(activity)) {
              labeledLinks.push(
                buildLabeledLink(
                  `${getPastTense(activity.operation as string)} ${activity.object2}`,
                  buildAnchor(
                    named('group', 1),
                    activity.object2 as string,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `from ${activity.object1}`,
                  buildAnchor(
                    named('group'),
                    activity.object1 as string,
                    activity
                  )
                )
              );
            } else {
              labeledLinks.push(
                buildLabeledLink(
                  getPastTense(activity.operation as string),
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object2 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object2 as string,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `${named('role').role_field} from`,
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object1 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object1 as string,
                    activity
                  )
                )
              );
            }
            break;
          // expected outcome: "associated <object2> role_name to <object1>"
          case 'associate':
            if (isGroupRelationship(activity)) {
              labeledLinks.push(
                buildLabeledLink(
                  `${getPastTense(activity.operation as string)} ${activity.object1}`,
                  buildAnchor(
                    named('group'),
                    activity.object1 as string,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `to ${activity.object2}`,
                  buildAnchor(
                    named('group', 1),
                    activity.object2 as string,
                    activity
                  )
                )
              );
            } else {
              labeledLinks.push(
                buildLabeledLink(
                  getPastTense(activity.operation as string),
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object2 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object2 as string,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `${named('role').role_field} to`,
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object1 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object1 as string,
                    activity
                  )
                )
              );
            }
            break;
          default:
            break;
        }
        break;
      // CRUD operations / resource on resource dis+associations
      default:
        switch (activity.operation) {
          // expected outcome: "disassociated <object2> from <object1>"
          case 'disassociate':
            if (isGroupRelationship(activity)) {
              labeledLinks.push(
                buildLabeledLink(
                  `${getPastTense(activity.operation as string)} ${activity.object2}`,
                  buildAnchor(
                    named('group', 1),
                    activity.object2 as string,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `from ${activity.object1}`,
                  buildAnchor(
                    named('group'),
                    activity.object1 as string,
                    activity
                  )
                )
              );
            } else if (
              activity.object1 === 'workflow_job_template_node' &&
              activity.object2 === 'workflow_job_template_node'
            ) {
              labeledLinks.push(
                buildLabeledLink(
                  `${getPastTense(activity.operation as string)} two nodes on workflow`,
                  buildAnchor(
                    // Indexed by the whole name: this took the first
                    // character of it, which names no summary field, so the
                    // workflow went unnamed.
                    (
                      activity.summary_fields[
                        activity.object1 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object1 as string,
                    activity
                  )
                )
              );
            } else {
              labeledLinks.push(
                buildLabeledLink(
                  `${getPastTense(activity.operation as string)} ${activity.object2}`,
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object2 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object2 as string,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `from ${activity.object1}`,
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object1 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object1 as string,
                    activity
                  )
                )
              );
            }
            break;
          // expected outcome "associated <object2> to <object1>"
          case 'associate':
            // groups are the only resource that can be associated/disassociated into each other
            if (isGroupRelationship(activity)) {
              labeledLinks.push(
                buildLabeledLink(
                  `${getPastTense(activity.operation as string)} ${activity.object1}`,
                  buildAnchor(
                    named('group'),
                    activity.object1 as string,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `to ${activity.object2}`,
                  buildAnchor(
                    named('group', 1),
                    activity.object2 as string,
                    activity
                  )
                )
              );
            } else if (
              activity.object1 === 'workflow_job_template_node' &&
              activity.object2 === 'workflow_job_template_node'
            ) {
              labeledLinks.push(
                buildLabeledLink(
                  `${getPastTense(activity.operation as string)} two nodes on workflow`,
                  buildAnchor(
                    // Indexed by the whole name: this took the first
                    // character of it, which names no summary field, so the
                    // workflow went unnamed.
                    (
                      activity.summary_fields[
                        activity.object1 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object1 as string,
                    activity
                  )
                )
              );
            } else {
              labeledLinks.push(
                buildLabeledLink(
                  `${getPastTense(activity.operation as string)} ${activity.object1}`,
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object1 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object1 as string,
                    activity
                  )
                )
              );
              labeledLinks.push(
                buildLabeledLink(
                  `to ${activity.object2}`,
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object2 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object2 as string,
                    activity
                  )
                )
              );
            }
            break;
          case 'delete':
            labeledLinks.push(
              buildLabeledLink(
                `${getPastTense(activity.operation as string)} ${activity.object1}`,
                buildAnchor(changes, activity.object1 as string, activity)
              )
            );
            break;
          // expected outcome: "operation <object1>"
          case 'update':
            if (
              activity.object1 === 'workflow_approval' &&
              changes.status?.length === 2
            ) {
              let operationText = '';
              if (changes.status?.[1] === 'successful') {
                operationText = t`approved`;
              } else if (changes.status?.[1] === 'failed') {
                if (changes.timed_out && changes.timed_out[1] === true) {
                  operationText = t`timed out`;
                } else {
                  operationText = t`denied`;
                }
              } else {
                operationText = t`updated`;
              }
              labeledLinks.push(
                buildLabeledLink(
                  `${operationText} ${activity.object1}`,
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object1 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object1 as string,
                    activity
                  )
                )
              );
            } else {
              labeledLinks.push(
                buildLabeledLink(
                  `${getPastTense(activity.operation as string)} ${activity.object1}`,
                  buildAnchor(
                    (
                      activity.summary_fields[
                        activity.object1 as string
                      ] as SummaryFieldRef[]
                    )[0] as SummaryFieldRef,
                    activity.object1 as string,
                    activity
                  )
                )
              );
            }
            break;
          case 'create':
            labeledLinks.push(
              buildLabeledLink(
                `${getPastTense(activity.operation as string)} ${activity.object1}`,
                buildAnchor(changes, activity.object1 as string, activity)
              )
            );
            break;
          default:
            break;
        }
        break;
    }
  } catch (err) {
    return <span>{t`Event summary not available`}</span>;
  }

  return (
    <span>
      {labeledLinks.reduce<React.ReactNode>(
        (acc, x) =>
          acc === null ? (
            x
          ) : (
            <>
              {acc} {x}
            </>
          ),
        null
      )}
    </span>
  );
}

export default ActivityStreamDescription;
