import {
  isWorkloadIdentityLookup,
  isWorkloadIdentityType,
  withTestJobTemplate,
} from './workloadIdentity';

describe('workloadIdentity', () => {
  test('tells the lookups that log in as the job from the rest', () => {
    expect(isWorkloadIdentityLookup({ namespace: 'hashivault_kv_oidc' })).toBe(
      true
    );
    expect(isWorkloadIdentityLookup({ namespace: 'hashivault_ssh_oidc' })).toBe(
      true
    );
    expect(isWorkloadIdentityLookup({ namespace: 'hashivault_kv' })).toBe(
      false
    );
    expect(
      isWorkloadIdentityLookup({ namespace: 'oidc_workload_identity' })
    ).toBe(false);
    expect(isWorkloadIdentityLookup(null)).toBe(false);
  });

  test('counts the injected token as a workload identity type', () => {
    expect(
      isWorkloadIdentityType({ namespace: 'oidc_workload_identity' })
    ).toBe(true);
    expect(isWorkloadIdentityType({ namespace: 'hashivault_kv_oidc' })).toBe(
      true
    );
    expect(isWorkloadIdentityType({ namespace: 'aws' })).toBe(false);
  });

  test('adds the template to the test metadata by id', () => {
    expect(withTestJobTemplate({ secret_key: 'password' }, { id: 7 })).toEqual({
      secret_key: 'password',
      job_template_id: 7,
    });
    expect(withTestJobTemplate({ secret_key: 'password' }, null)).toEqual({
      secret_key: 'password',
    });
  });
});
