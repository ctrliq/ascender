import { toBuilderPayload } from './ExecutionEnvironmentBuilderForm';

describe('toBuilderPayload', () => {
  test('sends the ids of the objects the lookups picked', () => {
    expect(
      toBuilderPayload({
        name: 'b',
        description: '',
        image: 'quay.io/x/ee',
        tag: 'latest',
        execution_environment_file: 'execution-environment.yml',
        organization: { id: 1, name: 'Default' },
        project: { id: 7, name: 'EE' },
        credential: null,
      })
    ).toEqual({
      name: 'b',
      description: '',
      image: 'quay.io/x/ee',
      tag: 'latest',
      execution_environment_file: 'execution-environment.yml',
      organization: 1,
      project: 7,
      credential: null,
    });
  });
});
