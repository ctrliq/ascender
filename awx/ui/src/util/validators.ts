import { isValidDate } from '@patternfly/react-core';
import { t, plural } from '@lingui/core/macro';

/**
 * What every validator here returns: the message when the value is wrong, and
 * undefined when it is fine. This is the shape formik expects.
 */
export type ValidationError = string | undefined;

/** A single field validator, as the factories below produce. */
export type Validator<V = unknown> = (value: V) => ValidationError;

export function required(message?: string | null): Validator {
  const errorMessage = message || t`This field must not be blank`;
  return (value: unknown) => {
    if (typeof value === 'string' && !value.trim()) {
      return errorMessage;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return undefined;
    }
    if (!value) {
      return errorMessage;
    }
    return undefined;
  };
}

/**
 * The date the pickers hold, which is yyyy-MM-dd.
 *
 * PatternFly's isValidDate was used here as the validator itself, which takes
 * a Date and answers a boolean: given the field's string it answered false,
 * and a validator's falsy answer is "no error", so nothing was ever checked.
 */
export function validateDate(): Validator<string> {
  return (value: string) => {
    const dateRegex = /^\s*\d{4}-\d{2}-\d{2}\s*$/;
    if (
      !dateRegex.test(value) ||
      !isValidDate(new Date(`${value.trim()}T00:00:00`))
    ) {
      return t`Invalid date format`;
    }
    return undefined;
  };
}

export function validateTime(): Validator<string> {
  return (value: string) => {
    const timeRegex = new RegExp(
      `^\\s*(\\d\\d?):([0-5])(\\d)\\s*([AaPp][Mm])?\\s*$`
    );
    let message;
    const timeComponents = value.split(':');

    const date = new Date();
    // A value with no colon splits into one part, so the second index is
    // absent. parseInt(undefined) is NaN, which setMinutes accepts and
    // isValidDate then rejects, so this preserves the old behaviour while
    // saying out loud that the part may not be there.
    date.setHours(parseInt(timeComponents[0] ?? '', 10));
    date.setMinutes(parseInt(timeComponents[1] ?? '', 10));

    if (!isValidDate(date) || !timeRegex.test(value)) {
      message = t`Invalid time format`;
    }

    return message;
  };
}

export function maxLength(max: number): Validator<string> {
  return (value: string) => {
    if (value.trim().length > max) {
      return t`This field must not exceed ${max} characters`;
    }
    return undefined;
  };
}

export function minLength(min: number): Validator<string> {
  return (value: string) => {
    if (value.trim().length < min) {
      return t`This field must be at least ${min} characters`;
    }
    return undefined;
  };
}

export function minMaxValue(min: number, max: number): Validator<number> {
  return (value: number) => {
    if (!Number.isFinite(min) && value > max) {
      return t`This field must be a number and have a value less than ${max}`;
    }
    if (!Number.isFinite(max) && value < min) {
      return t`This field must be a number and have a value greater than ${min}`;
    }
    if (value < min || value > max) {
      return t`This field must be a number and have a value between ${min} and ${max}`;
    }
    return undefined;
  };
}

export function requiredEmail(): Validator<string> {
  return (value: string) => {
    if (!value) {
      return t`This field must not be blank`;
    }

    // This isn't a perfect validator. It's likely to let a few
    // invalid (though unlikely) email addresses through.

    // This is ok, because the server will always do strict validation for us.

    const splitVals = value.split('@');

    if (splitVals.length >= 2) {
      if (splitVals[0] && splitVals[1]) {
        // We get here if the string has an '@' that is enclosed by
        // non-empty substrings
        return undefined;
      }
    }

    return t`Invalid email address`;
  };
}

export function noWhiteSpace(): Validator<string> {
  return (value: string) => {
    if (/\s/.test(value)) {
      return t`This field must not contain spaces`;
    }
    return undefined;
  };
}

export function integer(): Validator {
  return (value: unknown) => {
    const str = String(value);
    if (!Number.isInteger(value) && /[^0-9]/.test(str)) {
      return t`This field must be an integer`;
    }
    return undefined;
  };
}

export function number(): Validator {
  return (value: unknown) => {
    const str = String(value);
    if (/^-?[0-9]*(\.[0-9]*)?$/.test(str)) {
      return undefined;
    }
    // large number scientific notation (e.g. '1e+21')
    if (/^-?[0-9]*e[+-][0-9]*$/.test(str)) {
      return undefined;
    }
    return t`This field must be a number`;
  };
}

export function twilioPhoneNumber(): Validator {
  return (value: unknown) => {
    const phoneNumbers = Array.isArray(value) ? value : [value];
    let error;
    if (!error) {
      phoneNumbers.forEach((v) => {
        if (!/^\s*(?:\+?(\d{1,3}))?[. (]*(\d{7,12})$/.test(v)) {
          error = plural(phoneNumbers.length, {
            one: 'Please enter a valid phone number.',
            other: 'Please enter valid phone numbers.',
          });
        }
      });
    }
    return error;
  };
}

export function url(): Validator<string> {
  return (value: string) => {
    if (!value) {
      return undefined;
    }
    // URL regex from https://urlregex.com/
    if (
      // eslint-disable-next-line @stylistic/max-len
      !/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=+$,\w]+@)?[A-Za-z0-9.-]+|(?:www\.|[-;:&=+$,\w]+@)[A-Za-z0-9.-]+)((?:\/[+~%/.\w\-_]*)?\??(?:[-+=&;%@.\w_]*)#?(?:[.!/\\\w]*))?)/.test(
        value
      )
    ) {
      return t`Please enter a valid URL`;
    }
    return undefined;
  };
}

export function combine<V = unknown>(
  validators: (Validator<V> | null | undefined)[]
): Validator<V> {
  return (value: V) => {
    for (let i = 0; i < validators.length; i++) {
      const validate = validators[i];
      const error = validate ? validate(value) : null;
      if (error) {
        return error;
      }
    }
    return undefined;
  };
}

export function regExp(): Validator<string> {
  return (value: string) => {
    try {
      RegExp(value);
    } catch {
      return t`This field must be a regular expression`;
    }
    return undefined;
  };
}

export function requiredPositiveInteger(): Validator {
  return (value: unknown) => {
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) {
        return t`This field must be an integer`;
      }
      if (value < 1) {
        return t`This field must be greater than 0`;
      }
    }
    if (!value) {
      return t`Select a value for this field`;
    }
    return undefined;
  };
}
