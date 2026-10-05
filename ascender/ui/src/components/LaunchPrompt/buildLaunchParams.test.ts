import type { LaunchableResource } from 'types/api';
import buildLaunchParams from './buildLaunchParams';
import type { LaunchConfig, LaunchPromptValues } from './types';

vi.mock('../../api/models/Labels');

const resource = {
  id: 7,
  name: 'A job template',
  type: 'job_template',
  organization: 1,
  extra_vars: 'from_template: yes',
} as unknown as LaunchableResource;

describe('buildLaunchParams', () => {
  test('should send what the prompt collected, and leave the rest out', async () => {
    const config = { ask_variables_on_launch: true } as LaunchConfig;
    const values = {
      inventory: { id: 3, name: 'An inventory' },
      credentials: [{ id: 4 }, { id: 5 }],
      limit: 'web',
      extra_vars: 'answered: yes',
    } as unknown as LaunchPromptValues;

    const params = await buildLaunchParams(values, config, resource);

    expect(params.inventory_id).toEqual(3);
    expect(params.credentials).toEqual([4, 5]);
    expect(params.limit).toEqual('web');
    // Nothing was collected for these, so the template's own values stand.
    expect(params).not.toHaveProperty('job_type');
    expect(params).not.toHaveProperty('scm_branch');
  });

  /*
   * A workflow's prompt answers override its nodes', so a blank limit sent
   * for a workflow with none of its own would run every node on its whole
   * inventory. Blank is only sent where it clears a limit the template has.
   */
  test('leaves a blank limit out where the template has none to clear', async () => {
    const config = { ask_limit_on_launch: true } as LaunchConfig;
    const workflow = {
      ...resource,
      type: 'workflow_job_template',
      limit: null,
    } as unknown as LaunchableResource;

    const params = await buildLaunchParams(
      { limit: '' } as unknown as LaunchPromptValues,
      config,
      workflow
    );

    expect(params).not.toHaveProperty('limit');
  });

  test("sends a blank limit where it clears the template's own", async () => {
    const config = { ask_limit_on_launch: true } as LaunchConfig;
    const template = { ...resource, limit: 'web' } as LaunchableResource;

    const params = await buildLaunchParams(
      { limit: '' } as unknown as LaunchPromptValues,
      config,
      template
    );

    expect(params.limit).toEqual('');
  });

  /*
   * A survey answer is an extra variable by another name, and the two are one
   * document by the time the api sees them.
   */
  test('should merge the survey answers into the variables', async () => {
    const config = { ask_variables_on_launch: true } as LaunchConfig;
    const values = {
      extra_vars: '---\nfoo: bar',
      survey_question: 'an answer',
    } as unknown as LaunchPromptValues;

    const params = await buildLaunchParams(values, config, resource);

    expect(params.extra_vars).toEqual({
      foo: 'bar',
      question: 'an answer',
    });
  });

  test("should fall back to the template's variables where it does not ask", async () => {
    const config = {} as LaunchConfig;

    const params = await buildLaunchParams(
      {} as LaunchPromptValues,
      config,
      resource
    );

    expect(params.extra_vars).toEqual({ from_template: 'yes' });
  });

  test('should send instance groups only where the template asks for them', async () => {
    const values = {
      instance_groups: [{ id: 8 }, { id: 9 }],
    } as unknown as LaunchPromptValues;

    expect(
      await buildLaunchParams(values, {} as LaunchConfig, resource)
    ).not.toHaveProperty('instance_groups');
    expect(
      await buildLaunchParams(
        values,
        { ask_instance_groups_on_launch: true } as LaunchConfig,
        resource
      )
    ).toMatchObject({ instance_groups: [8, 9] });
  });
});
