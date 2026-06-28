import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CardBody } from 'components/Card';
import SurveyQuestionForm from './SurveyQuestionForm';

export default function SurveyQuestionAdd({ survey, updateSurvey }) {
  const [formError, setFormError] = useState(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const surveyUrl = pathname.replace('/add', '');

  const handleSubmit = async (question) => {
    const formData = { ...question };
    try {
      if (survey?.spec?.some((q) => q.variable === formData.variable)) {
        setFormError(
          new Error(
            `Survey already contains a question with variable named “${formData.variable}”`
          )
        );
        return;
      }
      if (
        formData.type === 'multiselect' ||
        formData.type === 'multiplechoice'
      ) {
        const choices = [];
        let defaultAnswers = '';
        formData.formattedChoices.forEach(({ choice, isDefault }, i) => {
          choices.push(choice);
          if (isDefault) {
            defaultAnswers =
              i === formData.formattedChoices.length - 1
                ? defaultAnswers.concat(`${choice}`)
                : defaultAnswers.concat(`${choice}\n`);
          }
        });
        formData.default = defaultAnswers.trim();
        formData.choices = choices;
      }
      delete formData.formattedChoices;
      const newSpec = survey?.spec ? survey.spec.concat(formData) : [formData];
      await updateSurvey(newSpec);
      navigate(surveyUrl);
    } catch (err) {
      setFormError(err);
    }
  };

  const handleCancel = () => {
    navigate(surveyUrl);
  };

  return (
    <CardBody>
      <SurveyQuestionForm
        handleSubmit={handleSubmit}
        handleCancel={handleCancel}
        submitError={formError}
      />
    </CardBody>
  );
}
