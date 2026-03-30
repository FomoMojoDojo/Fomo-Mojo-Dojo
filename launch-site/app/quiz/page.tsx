"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { siteConfig } from "@/config/site";

type QuizOption = {
  label: string;
  value: number;
};

type QuizQuestion = {
  id: string;
  category: "focus" | "decision" | "alignment" | "adoption";
  prompt: string;
  options: QuizOption[];
};

const questions: QuizQuestion[] = [
  {
    id: "q1",
    category: "focus",
    prompt: "How often do priorities shift after work is already in motion?",
    options: [
      { label: "Rarely", value: 0 },
      { label: "Sometimes", value: 1 },
      { label: "Often", value: 2 },
      { label: "Constantly", value: 3 },
    ],
  },
  {
    id: "q2",
    category: "decision",
    prompt: "How often do important decisions get revisited or reopened?",
    options: [
      { label: "Rarely", value: 0 },
      { label: "Sometimes", value: 1 },
      { label: "Often", value: 2 },
      { label: "Almost every week", value: 3 },
    ],
  },
  {
    id: "q3",
    category: "alignment",
    prompt: "How aligned are leaders and teams on what matters most this quarter?",
    options: [
      { label: "Highly aligned", value: 0 },
      { label: "Mostly aligned", value: 1 },
      { label: "Partially aligned", value: 2 },
      { label: "Not aligned", value: 3 },
    ],
  },
  {
    id: "q4",
    category: "adoption",
    prompt: "How closely is customer adoption matching your expectations?",
    options: [
      { label: "Above expectations", value: 0 },
      { label: "Near expectations", value: 1 },
      { label: "Below expectations", value: 2 },
      { label: "Far below expectations", value: 3 },
    ],
  },
  {
    id: "q5",
    category: "focus",
    prompt: "How clear is your next highest-leverage move right now?",
    options: [
      { label: "Very clear", value: 0 },
      { label: "Mostly clear", value: 1 },
      { label: "Somewhat clear", value: 2 },
      { label: "Unclear", value: 3 },
    ],
  },
  {
    id: "q6",
    category: "decision",
    prompt: "How confident are you that your current roadmap reflects today's reality?",
    options: [
      { label: "Very confident", value: 0 },
      { label: "Mostly confident", value: 1 },
      { label: "Somewhat confident", value: 2 },
      { label: "Not confident", value: 3 },
    ],
  },
];

const categoryLabel: Record<QuizQuestion["category"], string> = {
  focus: "Priority Focus",
  decision: "Decision Discipline",
  alignment: "Team Alignment",
  adoption: "Customer Adoption Signal",
};

const resultHeadline = (score: number) => {
  if (score <= 5) return "Momentum looks healthy";
  if (score <= 10) return "Momentum is constrained";
  return "Momentum is being blocked";
};

export default function QuizPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>(Array(questions.length).fill(-1));
  const isComplete = step >= questions.length;

  const progress = Math.round((Math.min(step, questions.length) / questions.length) * 100);
  const current = questions[Math.min(step, questions.length - 1)];
  const selectedValue = answers[Math.min(step, questions.length - 1)];
  const totalScore = useMemo(() => answers.filter((v) => v >= 0).reduce((sum, v) => sum + v, 0), [answers]);

  const categoryScores = useMemo(() => {
    const scores: Record<QuizQuestion["category"], number> = {
      focus: 0,
      decision: 0,
      alignment: 0,
      adoption: 0,
    };

    questions.forEach((question, index) => {
      const value = answers[index];
      if (value >= 0) scores[question.category] += value;
    });

    return scores;
  }, [answers]);

  const topCategory = useMemo(() => {
    const sorted = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] as QuizQuestion["category"] | undefined;
  }, [categoryScores]);

  const onSelect = (value: number) => {
    const nextAnswers = [...answers];
    nextAnswers[step] = value;
    setAnswers(nextAnswers);
  };

  const onNext = () => {
    if (selectedValue < 0) return;
    if (step === questions.length - 1) {
      setStep(questions.length);
      return;
    }
    setStep((s) => s + 1);
  };

  const onBack = () => {
    if (step <= 0) return;
    setStep((s) => s - 1);
  };

  const onRestart = () => {
    setAnswers(Array(questions.length).fill(-1));
    setStep(0);
  };

  return (
    <main className="quiz-page">
      <div className="ambient-grid" aria-hidden="true" />
      <section className="quiz-shell">
        <div className="quiz-head">
          <p className="kicker">MojoMap™ 3-Min Quiz</p>
          <h1 className="display-lg quiz-title">See what's blocking your momentum</h1>
          <p className="copy quiz-subhead">
            Answer a few fast questions. We&apos;ll show your likely constraint and the next best move.
          </p>
          <div className="quiz-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span className="quiz-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {!isComplete ? (
          <article className="quiz-card">
            <p className="quiz-step-label">
              Question {step + 1} of {questions.length}
            </p>
            <h2 className="quiz-question">{current.prompt}</h2>
            <div className="quiz-options">
              {current.options.map((option) => {
                const isSelected = selectedValue === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    className={`quiz-option ${isSelected ? "is-selected" : ""}`}
                    onClick={() => onSelect(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="quiz-actions">
              <button type="button" className="btn btn-secondary" onClick={onBack} disabled={step === 0}>
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onNext}
                disabled={selectedValue < 0}
              >
                {step === questions.length - 1 ? "See Results" : "Next"}
              </button>
            </div>
          </article>
        ) : (
          <article className="quiz-card">
            <p className="quiz-step-label">Your Signal</p>
            <h2 className="quiz-result-title">{resultHeadline(totalScore)}</h2>
            <p className="copy quiz-result-copy">
              Strongest drag area:{" "}
              <span className="quiz-result-accent">
                {topCategory ? categoryLabel[topCategory] : "Needs more data"}
              </span>
              .
            </p>

            <ul className="quiz-score-grid">
              {Object.entries(categoryScores).map(([key, value]) => (
                <li key={key} className="quiz-score-item">
                  <span>{categoryLabel[key as QuizQuestion["category"]]}</span>
                  <strong>{value}</strong>
                </li>
              ))}
            </ul>

            <p className="copy quiz-result-copy">
              Next step: book your diagnostic call and we&apos;ll build your initial MojoMap before we talk.
            </p>

            <div className="quiz-actions">
              <button type="button" className="btn btn-secondary" onClick={onRestart}>
                Retake Quiz
              </button>
              <a href={siteConfig.cta.secondaryUrl} className="btn btn-primary">
                {siteConfig.cta.secondaryLabel}
              </a>
            </div>
          </article>
        )}

        <div className="quiz-foot">
          <Link href="/" className="inline-link">
            Back to launch page
          </Link>
        </div>
      </section>
    </main>
  );
}

