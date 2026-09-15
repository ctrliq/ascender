import type { SurveyConfig, SurveyQuestion } from 'types/api';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CardBody } from 'components/Card';
import SurveyQuestionForm from './SurveyQuestionForm';
import type { SurveyQuestionFormValues } from './SurveyQuestionForm';

export interface SurveyQuestionAddProps {
  survey?: SurveyConfig | null;
  /** Saves the whole spec, which is how one question is added or changed. */
  updateSurvey: (questions: SurveyQuestion[]) => void;
  [key: string]: unknown;
}

export default function SurveyQuestionAdd({
  survey,
  updateSurvey,
}: SurveyQuestionAddProps) {
  const [formError, setFormError] = useState<unknown>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const surveyUrl = pathname.replace('/add', '');

  const handleSubmit = async (question: SurveyQuestionFormValues) => {
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
        const choices: string[] = [];
        let defaultAnswers = '';
        const formattedChoices = formData.formattedChoices ?? [];
        formattedChoices.forEach(({ choice, isDefault }, i) => {
          choices.push(choice);
          if (isDefault) {
            defaultAnswers =
              i === formattedChoices.length - 1
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
