import { CircleHelp, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentQuestion } from "../domain/agent-projection-types";

type AgentQuestionDockProps = {
  request: AgentQuestion;
  queueLength: number;
  resolving: boolean;
  onResolve: (resolution: { answers?: string[][]; rejected?: boolean }) => void;
};

export function AgentQuestionDock({ request, queueLength, resolving, onResolve }: AgentQuestionDockProps) {
  const { t } = useLocalization();
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const complete = useMemo(() => request.questions.length > 0 && request.questions.every((_question, index) => (
    (answers[index]?.some((answer) => answer.trim().length > 0) ?? false)
  )), [answers, request.questions]);
  return (
    <section className="desktop-agent-blocking-dock desktop-agent-question-dock" aria-label={t("agent.question.ariaLabel")}>
      <header><CircleHelp size={15} /><strong>{t("agent.question.inputNeeded")}</strong>{queueLength > 1 && <span>{t("agent.question.pending", { count: queueLength })}</span>}</header>
      {request.questions.map((question, index) => (
        <fieldset key={`${question.header}:${index}`} disabled={resolving}>
          <legend dir="auto">{question.header || t("agent.question.number", { number: index + 1 })}</legend>
          <p dir="auto">{question.question}</p>
          {question.options.length > 0 && question.options.map((option) => {
            const selected = answers[index]?.includes(option.label) ?? false;
            return (
              <label key={option.label}>
                <input
                  type={question.multiple ? "checkbox" : "radio"}
                  name={`agent-question-${request.requestId}-${index}`}
                  checked={selected}
                  onChange={() => setAnswers((current) => ({
                    ...current,
                    [index]: question.multiple
                      ? selected ? (current[index] ?? []).filter((value) => value !== option.label) : [...(current[index] ?? []), option.label]
                      : [option.label],
                  }))}
                />
                <span dir="auto"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
              </label>
            );
          })}
          {(question.options.length === 0 || question.custom) && (
            <input
              className="desktop-agent-question-input"
              aria-label={question.options.length > 0
                ? t("agent.question.otherFor", { question: bidiIsolate(question.question) })
                : question.question}
              placeholder={question.options.length > 0 ? t("agent.question.other") : t("agent.question.typeAnswer")}
              dir="auto"
              value={(answers[index] ?? []).find((answer) => !question.options.some((option) => option.label === answer)) ?? ""}
              onChange={(event) => setAnswers((current) => {
                const selectedOptions = (current[index] ?? []).filter((answer) => question.options.some((option) => option.label === answer));
                const custom = event.target.value;
                return {
                  ...current,
                  [index]: question.multiple ? [...selectedOptions, ...(custom ? [custom] : [])] : custom ? [custom] : [],
                };
              })}
            />
          )}
        </fieldset>
      ))}
      <footer>
        <button type="button" disabled={resolving} onClick={() => onResolve({ rejected: true })}>{t("agent.question.skip")}</button>
        <button type="button" className="is-primary" disabled={resolving || !complete} onClick={() => onResolve({
          answers: request.questions.map((_question, index) => answers[index] ?? []),
        })}>{resolving && <LoaderCircle size={12} className="desktop-agent-spin" />} {t("agent.question.continue")}</button>
      </footer>
    </section>
  );
}
