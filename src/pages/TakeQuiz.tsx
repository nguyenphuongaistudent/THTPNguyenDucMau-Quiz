import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Quiz, Question, User, Result } from '../types';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Loader2, Send, X } from 'lucide-react';
import { cn, formatDuration } from '../lib/utils';

interface TakeQuizProps {
  quizId: string;
  user: User;
  onComplete: () => void;
  onCancel: () => void;
}

export default function TakeQuiz({ quizId, user, onComplete, onCancel }: TakeQuizProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const fetchQuizData = async () => {
      try {
        const quizDoc = await getDocs(collection(db, 'quizzes'));
        const foundQuiz = quizDoc.docs.find(doc => doc.id === quizId);
        if (foundQuiz) {
          setQuiz({ id: foundQuiz.id, ...foundQuiz.data() } as Quiz);
          setTimeLeft(foundQuiz.data().duration * 60);
          
          const questionsSnapshot = await getDocs(collection(db, 'quizzes', quizId, 'questions'));
          const questionList = questionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Question[];
          setQuestions(questionList);
          setAnswers(new Array(questionList.length).fill(-1));
        }
      } catch (error) {
        console.error('Error fetching quiz:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuizData();
  }, [quizId]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      let correctCount = 0;
      questions.forEach((q, index) => {
        if (answers[index] === q.correctOptionIndex) {
          correctCount++;
        }
      });

      const score = (correctCount / questions.length) * 10;

      await addDoc(collection(db, 'results'), {
        quizId,
        quizTitle: quiz?.title,
        studentUid: user.uid,
        studentName: user.displayName,
        score: Number(score.toFixed(2)),
        totalQuestions: questions.length,
        correctAnswers: correctCount,
        completedAt: serverTimestamp(),
        answers
      });

      onComplete();
    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert('Có lỗi xảy ra khi nộp bài.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, questions, answers, quiz, user, quizId, onComplete]);

  useEffect(() => {
    if (!isStarted || timeLeft <= 0) {
      if (isStarted && timeLeft <= 0) handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isStarted, timeLeft, handleSubmit]);

  const handleAnswerSelect = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = optionIndex;
    setAnswers(newAnswers);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!quiz) return <div>Không tìm thấy bài thi.</div>;

  if (!isStarted) {
    return (
      <div className="max-w-2xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center shadow-sm">
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <Clock className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 mb-4 italic">{quiz.title}</h1>
          <p className="text-stone-500 mb-8 leading-relaxed">
            {quiz.description || "Bài thi này kiểm tra kiến thức tổng quát của bạn."}
          </p>
          
          <div className="grid grid-cols-2 gap-6 mb-10">
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
              <p className="text-xs font-bold text-stone-400 uppercase mb-1">Thời gian</p>
              <p className="text-xl font-medium text-stone-900">{quiz.duration} phút</p>
            </div>
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
              <p className="text-xs font-bold text-stone-400 uppercase mb-1">Số câu hỏi</p>
              <p className="text-xl font-medium text-stone-900">{questions.length} câu</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={onCancel}
              className="flex-1 px-8 py-4 text-stone-500 font-medium hover:text-stone-900 transition-colors"
            >
              Quay lại
            </button>
            <button
              onClick={() => setIsStarted(true)}
              className="flex-1 bg-stone-900 text-white py-4 px-8 rounded-2xl hover:bg-stone-800 transition-all font-medium shadow-lg shadow-stone-200"
            >
              Bắt đầu làm bài
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Quiz Header */}
      <div className="sticky top-20 z-40 bg-white/80 backdrop-blur-md border border-stone-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center text-white font-serif italic font-bold">
            {currentQuestionIndex + 1}
          </div>
          <div>
            <h2 className="text-sm font-medium text-stone-900 line-clamp-1">{quiz.title}</h2>
            <div className="w-48 h-1.5 bg-stone-100 rounded-full mt-1 overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold text-lg",
          timeLeft < 60 ? "bg-red-50 text-red-600 animate-pulse" : "bg-stone-50 text-stone-900"
        )}>
          <Clock className="w-5 h-5" />
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
      </div>

      {/* Question Card */}
      <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 shadow-sm min-h-[400px] flex flex-col">
        <div className="flex-grow">
          <p className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-4">Câu hỏi {currentQuestionIndex + 1} / {questions.length}</p>
          <h3 className="text-2xl font-medium text-stone-900 mb-10 leading-relaxed">
            {currentQuestion.text}
          </h3>

          <div className="grid grid-cols-1 gap-4">
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSelect(index)}
                className={cn(
                  "flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all group",
                  answers[currentQuestionIndex] === index 
                    ? "border-emerald-500 bg-emerald-50/30 ring-4 ring-emerald-500/5" 
                    : "border-stone-100 hover:border-stone-200 hover:bg-stone-50"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-colors",
                  answers[currentQuestionIndex] === index 
                    ? "bg-emerald-500 text-white" 
                    : "bg-stone-100 text-stone-400 group-hover:bg-stone-200"
                )}>
                  {String.fromCharCode(65 + index)}
                </div>
                <span className={cn(
                  "text-lg font-medium transition-colors",
                  answers[currentQuestionIndex] === index ? "text-emerald-900" : "text-stone-700"
                )}>
                  {option}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mt-12 pt-8 border-t border-stone-50">
          <button
            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
            disabled={currentQuestionIndex === 0}
            className="flex items-center gap-2 px-6 py-3 text-stone-500 font-medium hover:text-stone-900 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" /> Trước đó
          </button>

          {currentQuestionIndex === questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={submitting || answers.includes(-1)}
              className="flex items-center gap-2 bg-emerald-600 text-white py-3 px-10 rounded-2xl hover:bg-emerald-700 transition-all font-medium shadow-lg shadow-emerald-200 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              Nộp bài
            </button>
          ) : (
            <button
              onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
              className="flex items-center gap-2 bg-stone-900 text-white py-3 px-10 rounded-2xl hover:bg-stone-800 transition-all font-medium shadow-lg shadow-stone-200"
            >
              Tiếp theo <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Question Navigator */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
        <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Danh sách câu hỏi</p>
        <div className="flex flex-wrap gap-2">
          {questions.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentQuestionIndex(index)}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all",
                currentQuestionIndex === index ? "ring-2 ring-stone-900 ring-offset-2" : "",
                answers[index] !== -1 ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-400"
              )}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
