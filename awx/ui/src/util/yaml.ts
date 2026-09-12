import * as yaml from 'js-yaml';

export function yamlToJson(yamlString: string | null | undefined): string {
  if (!yamlString || !yamlString.trim()) {
    return '{}';
  }
  const value = yaml.load(yamlString);
  if (!value) {
    return '{}';
  }
  if (typeof value !== 'object') {
    throw new Error('yaml is not in object format');
  }
  return JSON.stringify(value, null, 2);
}

export function jsonToYaml(jsonString: string): string {
  if (jsonString.trim() === '') {
    return '---\n';
  }
  const value = JSON.parse(jsonString);
  if (Object.entries(value).length === 0) {
    return '---\n';
  }
  return yaml.dump(value);
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isJsonString(jsonString: unknown): boolean {
  if (typeof jsonString !== 'string') {
    return false;
  }
  let value: unknown;
  try {
    value = JSON.parse(jsonString);
  } catch (e) {
    return false;
  }

  return typeof value === 'object' && value !== null;
}

export function parseVariableField(
  variableField: string | null | undefined
): Record<string, unknown> {
  if (variableField === '---' || variableField === '{}') {
    return {};
  }
  // Reassigning the parameter is what the JavaScript did; naming each step
  // keeps the types honest about what is a string and what is parsed.
  const asJson = isJsonString(variableField)
    ? (variableField as string)
    : yamlToJson(variableField);

  return JSON.parse(asJson) as Record<string, unknown>;
}
