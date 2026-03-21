import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'teacher' | 'student' | 'guest';

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  isApproved: boolean;
  createdAt: Timestamp;
  emailVerified?: boolean;
}

export type QuizTopic = 'regular' | 'periodic' | 'graduation';

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  subject: string;
  topic: QuizTopic;
  duration: number; // minutes
  maxAttempts?: number; // 0 or undefined means unlimited
  createdBy: string;
  createdAt: Timestamp;
  isActive: boolean;
}

export type QuestionType = 'multiple_choice' | 'true_false';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options: string[]; // For multiple_choice: [A, B, C, D]. For true_false: [a, b, c, d] sub-statements.
  correctOptionIndex?: number; // For multiple_choice: index of correct option.
  correctAnswers?: boolean[]; // For true_false: array of 4 booleans [true, false, true, true] for a, b, c, d.
  explanation?: string;
  order: number;
}

export interface Result {
  id: string;
  quizId: string;
  quizTitle: string;
  subject: string;
  topic: QuizTopic;
  studentUid: string;
  studentName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  completedAt: Timestamp;
  answers: { val: number | boolean[] }[];
}
