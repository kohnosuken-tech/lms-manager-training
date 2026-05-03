"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, RequiredLabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addQuestionAction,
  deleteQuestionAction,
  reorderQuestionAction,
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
            isFirst={i === 0}
            isLast={i === questions.length - 1}
            prevQuestion={i > 0 ? questions[i - 1] : null}
            nextQuestion={i < questions.length - 1 ? questions[i + 1] : null}
          />
        ))}
        {questions.length === 0 ? (
          <EmptyState
            icon={<HelpCircle className="size-10" />}
            title="まだ設問がありません"
            description="上のフォームから設問を追加してください。"
          />
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
        toast.success("設問を追加しました。");
      } else {
        setError(r.error.message);
        toast.error(r.error.message);
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
  isFirst,
  isLast,
  prevQuestion,
  nextQuestion,
}: {
  testId: string;
  question: Question;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  prevQuestion: Question | null;
  nextQuestion: Question | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [reorderPending, startReorder] = useTransition();

  const onMoveUp = () => {
    if (!prevQuestion) return;
    startReorder(async () => {
      const r = await reorderQuestionAction({
        testId,
        idA: question.id,
        orderA: question.order,
        idB: prevQuestion.id,
        orderB: prevQuestion.order,
      });
      if (r.ok) {
        toast.success(`Q${index} を上に移動しました。`);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const onMoveDown = () => {
    if (!nextQuestion) return;
    startReorder(async () => {
      const r = await reorderQuestionAction({
        testId,
        idA: question.id,
        orderA: question.order,
        idB: nextQuestion.id,
        orderB: nextQuestion.order,
      });
      if (r.ok) {
        toast.success(`Q${index} を下に移動しました。`);
      } else {
        toast.error(r.error.message);
      }
    });
  };
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
        toast.success(`Q${index} を更新しました。`);
      } else {
        setError(r.error.message);
        toast.error(r.error.message);
      }
    });
  };

  const onDelete = () => {
    start(async () => {
      const r = await deleteQuestionAction({ id: question.id, testId });
      if (r.ok) {
        toast.success(`Q${index} を削除しました。`);
      } else {
        setError(r.error.message);
        toast.error(r.error.message);
      }
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
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onMoveUp}
              disabled={isFirst || reorderPending || pending}
              aria-label={`Q${index} を上に移動`}
              aria-disabled={isFirst}
            >
              <ChevronUp className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onMoveDown}
              disabled={isLast || reorderPending || pending}
              aria-label={`Q${index} を下に移動`}
              aria-disabled={isLast}
            >
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={pending || reorderPending}
            >
              編集
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  disabled={pending || reorderPending}
                >
                  削除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>設問を削除しますか?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Q{index}「{question.prompt.slice(0, 30)}
                    {question.prompt.length > 30 ? "..." : ""}
                    」を削除します。この操作は取り消せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={onDelete}
                  >
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
          <RequiredLabel>設問文</RequiredLabel>
          <Textarea
            rows={2}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            required
            aria-required="true"
          />
        </div>
        <div className="space-y-1">
          <Label>形式</Label>
          <Select
            value={type}
            onValueChange={(v) => onTypeChange(v as "SINGLE" | "MULTIPLE")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SINGLE">単一選択 (1 つ正解)</SelectItem>
              <SelectItem value="MULTIPLE">複数選択 (複数正解)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>選択肢</Label>
        {type === "SINGLE" ? (
          <RadioGroup
            value={String(choices.findIndex((c) => c.correct))}
            onValueChange={(v) => setChoiceCorrect(Number(v), true)}
            className="gap-2"
          >
            {choices.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <RadioGroupItem
                  value={String(i)}
                  id={`choice-radio-${i}`}
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
          </RadioGroup>
        ) : (
          <div className="space-y-2">
            {choices.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Checkbox
                  id={`choice-check-${i}`}
                  checked={c.correct}
                  onCheckedChange={(checked) =>
                    setChoiceCorrect(i, checked === true)
                  }
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
          </div>
        )}
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
