import type { Untyped } from 'types/api';

export function assertDetail(wrapper: Untyped, label: Untyped, value: Untyped) {
  expect(wrapper.find(`Detail[label="${label}"] dt`).text()).toBe(label);
  expect(wrapper.find(`Detail[label="${label}"] dd`).text()).toBe(value);
}

export function assertVariableDetail(
  wrapper: Untyped,
  label: Untyped,
  value: Untyped
) {
  expect(
    wrapper.find(`CodeDetail[label="${label}"] .pf-v6-c-form__label`).text()
  ).toBe(label);
  expect(
    wrapper.find(`CodeDetail[label="${label}"] CodeEditor`).prop('value')
  ).toBe(value);
}
