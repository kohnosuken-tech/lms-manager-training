"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  addQuestionAction,
  deleteQuestionAction,
  updateQuestionAction,
} from "./actions";

type Choice = { id?: string; label: string; correct: boolean };
type Question = {
  id: string;
  type: "SINGLE" | "MULTIPLE";
  prompt: string;
  explanation: string;
  order: number;
  choices: Choice[];
};

const blankChoices = (): Choice[] => [
  { label: "", correct: true },
  { label: "", correct: false },
  { label: "", correct: false },
  { label: "", correct: false },
];

export function QuestionsSection({
  testId,
  questions,
}: {
  testId: string;
  questions: Question[];
}) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-base font-medium">設問</h2>

      <NewQuestionForm testId={testId} />

      <div className="space-y-3">
        {questions.map((q, i) => (
          <QuestionEditor
            key={q.id}
            testId={testId}
            question={q}
            index={i + 1}
          />
        ))}
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだ設問がありません。上のフォームから追加してください。
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NewQuestionForm({ testId }: { testId: string }) {
  const [pending, start] = useTransition();
  const [type, setType] = useState<"SINGLE" | "MULTIPLE">("SINGLE");
  const [prompt, setPrompt] = useState("");
  const [explanation, setExplanation] = useState("");
  const [choices, setChoices] = useState<Choice[]>(blankChoices());
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPrompt("");
    setExplanation("");
    setChoices(blankChoices());
    setType("SINGLE");
    setError(null);
  };

  const onSubmit = () => {
    start(async () => {
      const r = await addQuestionAction({
        testId,
        type,
        prompt,
        explanation,
        choices: choices
          .filter((c) => c.label.trim().length > 0)
          .map((c) => ({ label: c.label, correct: c.correct })),
      });
      if (r.ok) {
        reset();
      } else {
        setError(r.error.message);
      }
    });
  };

  return (
    <div className="rounded-md border p-3 space-y-3 bg-background">
      <h3 className="text-sm font-medium">設問を追加</h3>
      <ChoiceEditor
        type={type}
        onTypeChange={setType}
        prompt={prompt}
        onPromptChange={setPrompt}
        explanation={explanation}
        onExplanationChange={setExplanation}
        choices={choices}
        onChoicesChange={setChoices}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reset}
          disabled={pending}
        >
          リセット
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={pending || prompt.trim().length === 0}
        >
          {pending ? "追加中..." : "追加"}
        </Button>
      </div>
    </div>
  );
}

function QuestionEditor({
  testId,
  question,
  index,
}: {
  testId: string;
  question: Question;
  index: number;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [type, setType] = useState<"SINGLE" | "MULTIPLE">(question.type);
  const [prompt, setPrompt] = useState(question.prompt);
  const [explanation, setExplanation] = useState(question.explanation);
  const [choices, setChoices] = useState<Choice[]>(
    question.choices.map((c) => ({
      id: c.id,
      label: c.label,
      correct: c.correct,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    start(async () => {
      const r = await updateQuestionAction({
        id: question.id,
        testId,
        type,
        prompt,
        explanation,
        choices: choices
          .filter((c) => c.label.trim().length > 0)
          .map((c) => ({ label: c.label, correct: c.correct })),
      });
      if (r.ok) {
        setEditing(false);
        setError(null);
      } else {
        setError(r.error.message);
      }
    });
  };

  const onDelete = () => {
    if (!confirm(`Q${index} を削除します。よろしいですか?`)) return;
    start(async () => {
      const r = await deleteQuestionAction({ id: question.id, testId });
      if (!r.ok) setError(r.error.message);
    });
  };

  if (!editing) {
    return (
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Q{index}</Badge>
              <Badge variant="secondary">
                {question.type === "SINGLE" ? "単一選択" : "複数選択"}
              </Badge>
            </div>
            <p className="mt-2 font-medium">{question.prompt}</p>
          </div>
          <div className="space-x-1">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={pending}
            >
              編集
            </Button>
            <Button
              type="button"
              size="xs"
              variant="destructive"
              onClick={onDelete}
              disabled={pending}
            >
              削除
            </Button>
          </div>
        </div>
        <ul className="text-sm space-y-1">
          {question.choices.map((c, i) => (
            <li key={c.id ?? i} className="flex items-center gap-2">
              <span
                className={
                  c.correct
                    ? "inline-block w-4 text-emerald-600"
                    : "inline-block w-4 text-muted-foreground"
                }
              >
                {c.correct ? "✓" : "・"}
              </span>
              {c.label}
            </li>
          ))}
        </ul>
        {question.explanation ? (
          <p className="text-xs text-muted-foreground">
            解説: {question.explanation}
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <Badge variant="outline">Q{index} 編集中</Badge>
      </div>
      <ChoiceEditor
        type={type}
        onTypeChange={setType}
        prompt={prompt}
        onPromptChange={setPrompt}
        explanation={explanation}
        onExplanationChange={setExplanation}
        choices={choices}
        onChoicesChange={setChoices}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={pending}
        >
          キャンセル
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={pending}>
          {pending ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}

function ChoiceEditor({
  type,
  onTypeChange,
  prompt,
  onPromptChange,
  explanation,
  onExplanationChange,
  choices,
  onChoicesChange,
}: {
  type: "SINGLE" | "MULTIPLE";
  onTypeChange: (t: "SINGLE" | "MULTIPLE") => void;
  prompt: string;
  onPromptChange: (s: string) => void;
  explanation: string;
  onExplanationChange: (s: string) => void;
  choices: Choice[];
  onChoicesChange: (c: Choice[]) => void;
}) {
  const setChoiceLabel = (i: number, label: string) => {
    onChoicesChange(choices.map((c, idx) => (idx === i ? { ...c, label } : c)));
  };
  const setChoiceCorrect = (i: number, correct: boolean) => {
    if (type === "SINGLE" && correct) {
      onChoicesChange(
        choices.map((c, idx) => ({ ...c, correct: idx === i })),
      );
    } else {
      onChoicesChange(
        choices.map((c, idx) => (idx === i ? { ...c, correct } : c)),
      );
    }
  };
  const addChoice = () =>
    onChoicesChange([...choices, { label: "", correct: false }]);
  const removeChoice = (i: number) =>
    onChoicesChange(choices.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2 space-y-1">
          <Label>設問文</Label>
          <Textarea
            rows={2}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label>形式</Label>
          <select
            value={type}
            onChange={(e) =>
              onTypeChange(e.target.value as "SINGLE" | "MULTIPLE")
            }
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="SINGLE">単一選択 (1 つ正解)</option>
            <option value="MULTIPLE">複数選択 (複数正解)</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>選択肢</Label>
        {choices.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type={type === "SINGLE" ? "radio" : "checkbox"}
              name="correct-toggle"
              checked={c.correct}
              onChange={(e) => setChoiceCorrect(i, e.target.checked)}
              aria-label={`選択肢 ${i + 1} を正解にする`}
            />
            <Input
              value={c.label}
              onChange={(e) => setChoiceLabel(i, e.target.value)}
              placeholder={`選択肢 ${i + 1}`}
              className="flex-1"
            />
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => removeChoice(i)}
              disabled={choices.length <= 2}
            >
              削除
            </Button>
          </div>
        ))}
        <Button type="button" size="xs" variant="outline" onClick={addChoice}>
          選択肢を追加
        </Button>
      </div>

      <div className="space-y-1">
        <Label>解説 (提出後に表示)</Label>
        <Textarea
          rows={2}
          value={explanation}
          onChange={(e) => onExplanationChange(e.target.value)}
        />
      </div>
    </div>
  );
}
