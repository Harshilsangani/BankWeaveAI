"use client";
import { Activity, ScanLine, Target, TrendingUp } from "lucide-react";

export function SuggestedQuestions({
  questions,
  onSelect,
  disabled = false,
}: {
  questions: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="suggested-questions">
      {questions.map((question, i) => (
        <button key={question} onClick={() => onSelect(question)} disabled={disabled}>
          <span>
            {
              [
                <TrendingUp key="t" size={14} />,
                <Target key="g" size={14} />,
                <ScanLine key="s" size={14} />,
                <Activity key="a" size={14} />,
              ][i % 4]
            }
          </span>
          {question}
        </button>
      ))}
    </div>
  );
}
