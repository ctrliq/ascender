import type { SurveyConfig, SurveyQuestion } from 'types/api';
import React, { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router';
import ContentLoading from 'components/ContentLoading';
import { CardBody } from 'components/Card';
import SurveyQuestionForm from './SurveyQuestionForm';
import type { SurveyQuestionFormValues } from './SurveyQuestionForm';

export interface SurveyQuestionEditProps {
  survey?: SurveyConfig | null;
  /** Saves the whole spec, which is how one question is added or changed. */
  updateSurvey: (questions: SurveyQuestion[]) => void;
  [key: string]: unknown;
}

export default function SurveyQuestionEdit({
  survey,
  updateSurvey,
}: SurveyQuestionEditProps) {
  const [formError, setFormError] = useState<unknown>(null);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const surveyUrl = `${pathname.substr(0, pathname.indexOf('survey'))}survey`;
  const queryParams = new URLSearchParams(search);
  const questionVariable = decodeURIComponent(
    queryParams.get('question_variable') as string
  );

  if (!survey) {
    return <ContentLoading />;
  }

  const question = survey.spec?.find((q) => q.variable === questionVariable);

  if (!question) {
    return <Navigate to={surveyUrl} />;
  }

  const navigateToList = () => {
    navigate(surveyUrl);
  };

  const handleSubmit = async (formData: SurveyQuestionFormValues) => {
    const submittedData = { ...formData };
    try {
      if (
        submittedData.variable !== question.variable &&
        survey.spec?.find((q) => q.variable === submittedData.variable)
      ) {
        setFormError(
          new Error(
            `Survey already contains a question with variable named “${submittedData.variable}”`
          )
        );
        return;
      }
      const questionIndex = (survey.spec ?? []).findIndex(
        (q) => q.variable === questionVariable
      );
      if (questionIndex === -1) {
        throw new Error('Question not found in spec');
      }
      if (
        submittedData.type === 'multiselect' ||
        submittedData.type === 'multiplechoice'
      ) {
        const choices: string[] = [];
        let defaultAnswers = '';
        const formattedChoices = submittedData.formattedChoices ?? [];
        formattedChoices.forEach(({ choice, isDefault }, i) => {
          choices.push(choice);
          if (isDefault) {
            defaultAnswers =
              i === formattedChoices.length - 1
                ? defaultAnswers.concat(`${choice}`)
                : defaultAnswers.concat(`${choice}\n`);
          }
        });
        submittedData.default = defaultAnswers.trim();
        submittedData.choices = choices;
      }
      delete submittedData.formattedChoices;

      const spec = survey.spec ?? [];
      await updateSurvey([
        ...spec.slice(0, questionIndex),
        submittedData,
        ...spec.slice(questionIndex + 1),
      ]);
      navigateToList();
    } catch (err) {
      setFormError(err);
    }
  };

  return (
    <CardBody>
      <SurveyQuestionForm
        question={question}
        handleSubmit={handleSubmit}
        handleCancel={navigateToList}
        submitError={formError}
      />
    </CardBody>
  );
}
