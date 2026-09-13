export default function getSurveyValues(
  values: Record<string, unknown>
): Record<string, unknown> {
  const surveyValues: Record<string, unknown> = {};
  Object.keys(values).forEach((key) => {
    // The original also tested `values[key] !== []`, which is always true:
    // the literal allocates a new array, so !== compares two references that
    // can never be equal. The emptiness check it was reaching for is the
    // Array.isArray line below, which is why removing it changes nothing.
    if (key.startsWith('survey_')) {
      const value = values[key];
      if (Array.isArray(value) && value.length === 0) {
        return;
      }
      if (value === '') {
        return;
      }
      surveyValues[key.substr(7)] = value;
    }
  });
  return surveyValues;
}
