import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Quiz, Question, Result, User } from '../types';
import { Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Printer, X, Download } from 'lucide-react';
import { cn, formatDuration, formatDate } from '../lib/utils';
import RichText from './RichText';

interface ReviewQuizProps {
  result: Result;
  onClose: () => void;
  user: User;
}

export default function ReviewQuiz({ result, onClose, user }: ReviewQuizProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAnswers, setShowAnswers] = useState<Record<string, boolean>>({});

  const isAdminOrTeacher = user.role === 'admin' || user.role === 'teacher';

  useEffect(() => {
    const fetchQuizData = async () => {
      try {
        const quizDoc = await getDoc(doc(db, 'quizzes', result.quizId));
        if (quizDoc.exists()) {
          setQuiz({ id: quizDoc.id, ...quizDoc.data() } as Quiz);
          
          const questionsSnapshot = await getDocs(query(collection(db, 'quizzes', result.quizId, 'questions'), orderBy('order')));
          const questionList = questionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Question[];
          setQuestions(questionList);
        }
      } catch (error) {
        console.error('Error fetching review data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuizData();
  }, [result.quizId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
          <p className="text-stone-500 font-medium">Đang tải dữ liệu bài làm...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-50 flex items-center justify-center p-0 sm:p-4 overflow-hidden">
      <div className="bg-stone-50 w-full h-full sm:h-[95vh] sm:max-w-5xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center font-serif italic text-xl font-bold",
              result.score >= 8 ? "bg-emerald-100 text-emerald-700" : 
              result.score >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
            )}>
              {result.score}
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 leading-tight">{result.quizTitle}</h2>
              <p className="text-xs text-stone-500 font-medium uppercase tracking-wider">
                Thí sinh: {result.studentName} • {formatDate(result.completedAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdminOrTeacher && (
              <button 
                onClick={handlePrint}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-200"
              >
                <Printer className="w-4 h-4" />
                Xuất PDF
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6 sm:p-8 space-y-8 print:p-0 print:overflow-visible print:bg-white">
          {/* Print Header (Only visible when printing) */}
          <div className="hidden print:block mb-8 border-b-2 border-stone-900 pb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold uppercase">{result.quizTitle}</h1>
                <p className="text-sm font-medium">Môn: {result.subject} | Thời gian: {quiz?.duration} phút</p>
                <p className="text-sm font-medium">Thí sinh: {result.studentName} | Lớp: {result.studentClass || 'N/A'}</p>
                <p className="text-sm font-medium">Trường: {result.studentSchool || 'N/A'}</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold italic">{result.score}</p>
                <p className="text-xs font-bold uppercase tracking-widest">Điểm số</p>
                <p className="text-xs text-stone-500 mt-1">{formatDate(result.completedAt)}</p>
              </div>
            </div>
          </div>

          {/* Questions List */}
          <div className="space-y-12 max-w-4xl mx-auto">
            {questions.map((q, idx) => {
              const userAnswer = result.answers[idx]?.val;
              const isCorrect = q.type === 'multiple_choice' 
                ? userAnswer === q.correctOptionIndex
                : Array.isArray(userAnswer) && q.correctAnswers && userAnswer.every((val, i) => val === q.correctAnswers![i]);

              return (
                <div key={q.id} className="space-y-4 break-inside-avoid">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1",
                      isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-grow space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                          {q.type === 'multiple_choice' ? 'Phần I: Câu hỏi nhiều lựa chọn' : 'Phần II: Câu hỏi đúng sai'}
                        </div>
                        {(userAnswer === undefined || userAnswer === null || (Array.isArray(userAnswer) && userAnswer.every(v => v === null))) && (
                          <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-amber-200">
                            <AlertCircle className="w-3 h-3" />
                            Chưa chọn đáp án
                          </div>
                        )}
                      </div>
                      <RichText 
                        className="text-lg font-medium text-stone-900"
                        content={q.text}
                      />

                      {/* Options */}
                      <div className="grid grid-cols-1 gap-3">
                        {q.type === 'multiple_choice' ? (
                          q.options.map((opt, oIdx) => {
                            const isCorrectChoice = q.correctOptionIndex === oIdx;
                            const isUserChoice = userAnswer === oIdx;
                            const showAsCorrect = isCorrectChoice && (isAdminOrTeacher || showAnswers[q.id]);
                            
                            return (
                              <div 
                                key={oIdx}
                                className={cn(
                                  "p-4 rounded-2xl border-2 flex items-center gap-4 transition-all",
                                  showAsCorrect 
                                    ? "border-emerald-500 bg-emerald-50/50" 
                                    : isUserChoice 
                                      ? (isCorrect ? "border-emerald-500 bg-emerald-50/50" : "border-red-200 bg-red-50/50")
                                      : "border-stone-100 bg-white"
                                )}
                              >
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                                  showAsCorrect || (isUserChoice && isCorrect) ? "bg-emerald-500 text-white" : 
                                  isUserChoice ? "bg-red-500 text-white" : "bg-stone-100 text-stone-500"
                                )}>
                                  {String.fromCharCode(65 + oIdx)}
                                </div>
                                <RichText className="text-stone-700" content={opt} />
                                {(isAdminOrTeacher || showAnswers[q.id]) && (
                                  <>
                                    {isCorrectChoice && <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto" />}
                                    {isUserChoice && !isCorrectChoice && <XCircle className="w-5 h-5 text-red-500 ml-auto" />}
                                  </>
                                )}
                                {!isAdminOrTeacher && !showAnswers[q.id] && isUserChoice && (
                                  <div className="ml-auto">
                                    {isCorrect ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="space-y-4">
                            <div className="grid grid-cols-[1fr,80px,80px] gap-4 px-4 text-xs font-bold text-stone-400 uppercase tracking-widest">
                              <span>Lệnh hỏi</span>
                              <span className="text-center">Đúng</span>
                              <span className="text-center">Sai</span>
                            </div>
                            {['A', 'B', 'C', 'D'].map((label, oIdx) => {
                              const opt = q.options[oIdx];
                              const userVal = Array.isArray(userAnswer) ? userAnswer[oIdx] : null;
                              const correctVal = q.correctAnswers?.[oIdx];
                              const isSubCorrect = userVal === correctVal;

                              return (
                                <div key={oIdx} className="grid grid-cols-[1fr,80px,80px] gap-4 items-center p-4 bg-white rounded-2xl border border-stone-100">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-stone-400 uppercase">{label}.</span>
                                    <RichText className="text-stone-700" content={opt} />
                                  </div>
                                  <div className="flex justify-center">
                                    <div className={cn(
                                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                      userVal === true 
                                        ? (isSubCorrect ? "bg-emerald-500 border-emerald-500 text-white" : "bg-red-500 border-red-500 text-white")
                                        : ((isAdminOrTeacher || showAnswers[q.id]) && correctVal === true ? "border-emerald-200" : "border-stone-200")
                                    )}>
                                      {userVal === true && (
                                        isSubCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex justify-center">
                                    <div className={cn(
                                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                      userVal === false 
                                        ? (isSubCorrect ? "bg-emerald-500 border-emerald-500 text-white" : "bg-red-500 border-red-500 text-white")
                                        : ((isAdminOrTeacher || showAnswers[q.id]) && correctVal === false ? "border-emerald-200" : "border-stone-200")
                                    )}>
                                      {userVal === false && (
                                        isSubCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {!isAdminOrTeacher && !showAnswers[q.id] && (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => setShowAnswers(prev => ({ ...prev, [q.id]: true }))}
                            className="text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                          >
                            Hiển thị đáp án và giải thích
                          </button>
                        </div>
                      )}

                      {(isAdminOrTeacher || showAnswers[q.id]) && q.explanation && (
                        <div className="p-4 bg-stone-100 rounded-2xl border border-stone-200">
                          <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <AlertCircle className="w-3 h-3" />
                            Giải thích
                          </p>
                          <RichText className="text-sm text-stone-600" content={q.explanation} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          .fixed {
            position: relative !important;
            inset: auto !important;
            background: white !important;
            backdrop-filter: none !important;
          }
          .sm\\:rounded-3xl {
            border-radius: 0 !important;
          }
          .shadow-2xl {
            box-shadow: none !important;
          }
          .overflow-hidden, .overflow-y-auto {
            overflow: visible !important;
          }
          .flex-grow {
            flex-grow: 0 !important;
          }
          .bg-stone-50, .bg-stone-900\\/60 {
            background: white !important;
          }
          .fixed.inset-0.bg-stone-900\\/60 {
            display: block !important;
            padding: 0 !important;
          }
          .bg-stone-50.w-full.h-full {
            width: 100% !important;
            height: auto !important;
          }
          .print\\:block {
            display: block !important;
          }
          .print\\:p-0 {
            padding: 0 !important;
          }
          .print\\:overflow-visible {
            overflow: visible !important;
          }
          .print\\:bg-white {
            background: white !important;
          }
          /* Show only the review content */
          .fixed.inset-0.bg-stone-900\\/60,
          .fixed.inset-0.bg-stone-900\\/60 * {
            visibility: visible;
          }
          .print\\:hidden, .print\\:hidden * {
            visibility: hidden !important;
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}
