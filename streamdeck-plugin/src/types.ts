export interface Option {
  label: string;
  description: string;
  action?: string;
}

export type QuestionSource = "claude" | "codex";
export type QuestionKind = "question" | "permission";

export interface Question {
  session: string;
  header: string;
  question: string;
  multiSelect: boolean;
  claude_session_id: string;
  source: QuestionSource;
  kind: QuestionKind;
  request_id?: string;
  tool_name?: string;
  options: Option[];
}

export type ServerMsg =
  | { type: "sync"; questions: Question[] }
  | { type: "question_added"; question: Question }
  | { type: "question_resolved"; session: string }
  | { type: "error"; session: string; message: string };

export type ClientMsg =
  | { type: "answer"; session: string; index: number }
  | { type: "cancel"; session: string };
