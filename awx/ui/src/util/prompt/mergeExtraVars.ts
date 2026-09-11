import * as yaml from 'js-yaml';

export default function mergeExtraVars(
  extraVars: string = '',
  survey: Record<string, unknown> = {}
): Record<string, unknown> {
  const vars =
    ((extraVars ? yaml.load(extraVars) : undefined) as Record<
      string,
      unknown
    >) || {};
  return {
    ...vars,
    ...survey,
  };
}

export function maskPasswords(
  vars: Record<string, unknown>,
  passwordKeys: string[]
): Record<string, unknown> {
  const updated = { ...vars };
  passwordKeys.forEach((key) => {
    if (typeof updated[key] !== 'undefined') {
      updated[key] = '········';
    }
  });
  return updated;
}
