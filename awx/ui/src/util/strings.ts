export const toTitleCase = (string: string | null | undefined): string => {
  if (!string) {
    return '';
  }
  return string
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const arrayToString = (value: string[]): string => value.join(',');

export const stringToArray = (value: string): string[] =>
  value.split(',').filter((val) => !!val);

export const stringIsUUID = (value: string): boolean =>
  /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/gi.test(
    value
  );

export const truncateString = (str: string, num: number): string => {
  if (str.length <= num) {
    return str;
  }
  return `${str.slice(0, num)}...`;
};
