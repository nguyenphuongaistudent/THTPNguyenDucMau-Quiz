import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'teacher' | 'student' | 'student-vip' | 'guest';

export interface User {
  uid: string;
  email: string;
  username?: string;
  displayName?: string;
  school?: string;
  class?: string;
  role: UserRole;
  isApproved: boolean;
  createdAt: Timestamp;
  lastLoginAt?: Timestamp;
  emailVerified?: boolean;
}

export type QuizTopic = 'regular' | 'periodic' | 'graduation';

export interface SpecialAttemptLimit {
  type: 'class' | 'student';
  targetId: string; // class name or student UID
  maxAttempts: number;
}

export interface QuizSecuritySettings {
  preventTabSwitch: boolean;
  maxViolations: number; // 0 means unlimited
  autoSubmitOnMaxViolations: boolean;
  showWarningOnViolation: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  subject: string;
  topic: QuizTopic;
  duration: number; // minutes
  maxAttempts?: number; // 0 or undefined means unlimited
  specialAttemptLimits?: SpecialAttemptLimit[];
  createdBy: string;
  createdAt: Timestamp;
  isActive: boolean;
  allowedRoles?: UserRole[];
  reviewRoles?: UserRole[];
  order?: number;
  securitySettings?: QuizSecuritySettings;
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
  hidden?: boolean;
}

export interface Result {
  id: string;
  quizId: string;
  quizTitle: string;
  subject: string;
  topic: QuizTopic;
  studentUid: string;
  studentName: string;
  studentSchool?: string;
  studentClass?: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  completedAt: Timestamp;
  answers: { 
    questionId: string;
    val: number | boolean[];
    isCorrect: boolean;
  }[];
  shuffledQuestions?: Question[];
  violationCount?: number;
}
