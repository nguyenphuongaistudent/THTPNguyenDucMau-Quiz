import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'student';

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  createdAt: Timestamp;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  duration: number; // minutes
  createdBy: string;
  createdAt: Timestamp;
  isActive: boolean;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
}

export interface Result {
  id: string;
  quizId: string;
  quizTitle: string;
  studentUid: string;
  studentName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  completedAt: Timestamp;
  answers: number[];
}
