import React, { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { collection, getDocs, addDoc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
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
  const [answers, setAnswers] = useState<(number | boolean[])[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuizData = async () => {
      try {
        // Check attempts first
        const resultsQ = query(
          collection(db, 'results'),
          where('userId', '==', user.uid),
          where('quizId', '==', quizId)
        );
        const resultsSnapshot = await getDocs(resultsQ);
        const attemptCount = resultsSnapshot.size;

        const quizDoc = await getDocs(collection(db, 'quizzes'));
        const foundQuiz = quizDoc.docs.find(doc => doc.id === quizId);
        
        if (foundQuiz) {
          const quizData = { id: foundQuiz.id, ...foundQuiz.data() } as Quiz;
          
          if (quizData.maxAttempts && quizData.maxAttempts > 0 && attemptCount >= quizData.maxAttempts) {
            setAttemptError(`Bạn đã hết lượt làm bài thi này (Tối đa: ${quizData.maxAttempts} lượt).`);
            setLoading(false);
            return;
          }

          setQuiz(quizData);
          setTimeLeft(foundQuiz.data().duration * 60);
          
          const questionsSnapshot = await getDocs(query(collection(db, 'quizzes', quizId, 'questions'), orderBy('order')));
          const questionList = questionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Question[];
          setQuestions(questionList);
          setAnswers(new Array(questionList.length).fill(-1).map((_, i) => 
            questionList[i].type === 'true_false' ? [true, true, true, true] : -1
          ));
        }
      } catch (error) {
        console.error('Error fetching quiz:', error);
        handleFirestoreError(error, OperationType.GET, `quizzes/${quizId}`);
      } finally {
        setLoading(false);
      }
    };

    fetchQuizData();
  }, [quizId, user.uid]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      let totalScore = 0;
      let correctCount = 0;

      questions.forEach((q, index) => {
        const studentAnswer = answers[index];
        if (q.type === 'multiple_choice') {
          if (studentAnswer === q.correctOptionIndex) {
            correctCount++;
            totalScore += (10 / questions.length); // Standard weight for MCQ
          }
        } else if (q.type === 'true_false' && Array.isArray(studentAnswer)) {
          let subCorrectCount = 0;
          q.correctAnswers?.forEach((correct, i) => {
            if (studentAnswer[i] === correct) {
              subCorrectCount++;
            }
          });

          // TN THPT 2018 Scoring for Part II (True/False):
          // 1 correct: 0.1 points
          // 2 correct: 0.25 points
          // 3 correct: 0.5 points
          // 4 correct: 1.0 points
          // (Assuming total score is 10, we scale this)
          // If we assume each question is worth 1 "unit" of the total 10 points:
          let questionWeight = 10 / questions.length;
          if (subCorrectCount === 1) totalScore += questionWeight * 0.1;
          else if (subCorrectCount === 2) totalScore += questionWeight * 0.25;
          else if (subCorrectCount === 3) totalScore += questionWeight * 0.5;
          else if (subCorrectCount === 4) {
            totalScore += questionWeight * 1.0;
            correctCount++; // Count as fully correct for stats
          }
        }
      });

      await addDoc(collection(db, 'results'), {
        quizId,
        quizTitle: quiz?.title,
        subject: quiz?.subject,
        topic: quiz?.topic,
        studentUid: user.uid,
        studentName: user.displayName,
        score: Number(totalScore.toFixed(2)),
        totalQuestions: questions.length,
        correctAnswers: correctCount,
        completedAt: serverTimestamp(),
        answers: answers.map(a => ({ val: a }))
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

  const handleTFAnswerSelect = (subIndex: number, value: boolean) => {
    const newAnswers = [...answers];
    const currentTFAnswers = [...(newAnswers[currentQuestionIndex] as boolean[] || [true, true, true, true])];
    currentTFAnswers[subIndex] = value;
    newAnswers[currentQuestionIndex] = currentTFAnswers;
    setAnswers(newAnswers);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-stone-300" />
        <p className="text-stone-500 font-medium">Đang tải bài thi...</p>
      </div>
    );
  }

  if (attemptError) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-6">
        <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center shadow-xl shadow-stone-200/50">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-serif italic font-medium text-stone-900 mb-4">Không thể làm bài thi</h2>
          <p className="text-stone-500 mb-8">{attemptError}</p>
          <button
            onClick={onCancel}
            className="bg-stone-900 text-white py-3 px-8 rounded-xl hover:bg-stone-800 transition-all font-medium"
          >
            Quay lại trang chủ
          </button>
        </div>
      </div>
    );
  }

  if (!quiz) return <div className="text-center py-20 text-stone-500">Không tìm thấy bài thi.</div>;

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

  const mcQuestions = questions.map((q, i) => ({ ...q, originalIndex: i })).filter(q => q.type === 'multiple_choice');
  const tfQuestions = questions.map((q, i) => ({ ...q, originalIndex: i })).filter(q => q.type === 'true_false');

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
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

        <div className="flex items-center gap-4">
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold text-lg",
            timeLeft < 60 ? "bg-red-50 text-red-600 animate-pulse" : "bg-stone-50 text-stone-900"
          )}>
            <Clock className="w-5 h-5" />
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="hidden sm:flex items-center gap-2 bg-emerald-600 text-white py-2 px-6 rounded-xl hover:bg-emerald-700 transition-all font-medium shadow-lg shadow-emerald-200 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Nộp bài
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Question Area */}
        <div className="lg:col-span-3 space-y-8">
          {/* Question Card */}
          <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 shadow-sm min-h-[400px] flex flex-col">
            <div className="flex-grow">
              <p className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-4">
                {currentQuestion.type === 'multiple_choice' ? 'Phần 1: Trắc nghiệm' : 'Phần 2: Đúng/Sai'} - Câu {currentQuestionIndex + 1} / {questions.length}
              </p>
              <h3 
                className="text-2xl font-medium text-stone-900 mb-10 leading-relaxed markdown-body break-words"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentQuestion.text) }}
              />

              <div className="grid grid-cols-1 gap-4">
                {currentQuestion.type === 'multiple_choice' ? (
                  currentQuestion.options.map((option, index) => (
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
                        "text-lg font-medium transition-colors break-words flex-1 min-w-0",
                        answers[currentQuestionIndex] === index ? "text-emerald-900" : "text-stone-700"
                      )}>
                        {option}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="space-y-4">
                    {['a', 'b', 'c', 'd'].map((label, index) => (
                      <div key={index} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border border-stone-100 bg-stone-50/30 gap-4">
                        <div className="flex items-center gap-4 flex-grow min-w-0">
                          <span className="font-bold text-emerald-600 w-6 shrink-0">{label}.</span>
                          <span className="text-stone-700 font-medium break-words">{currentQuestion.options[index]}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-stone-200 shadow-sm">
                          <button
                            onClick={() => handleTFAnswerSelect(index, true)}
                            className={cn(
                              "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                              (answers[currentQuestionIndex] as boolean[])?.[index] === true 
                                ? "bg-emerald-600 text-white shadow-md" 
                                : "text-stone-400 hover:text-stone-600 hover:bg-stone-50"
                            )}
                          >
                            Đúng
                          </button>
                          <button
                            onClick={() => handleTFAnswerSelect(index, false)}
                            className={cn(
                              "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                              (answers[currentQuestionIndex] as boolean[])?.[index] === false 
                                ? "bg-red-600 text-white shadow-md" 
                                : "text-stone-400 hover:text-stone-600 hover:bg-stone-50"
                            )}
                          >
                            Sai
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                  disabled={submitting}
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
        </div>

        {/* Question Navigator Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm sticky top-40">
            <div className="mb-6">
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Danh sách câu hỏi</p>
            </div>

            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {mcQuestions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase mb-3 px-1">Phần 1: Trắc nghiệm</p>
                  <div className="grid grid-cols-5 gap-2">
                    {mcQuestions.map((q) => (
                      <button
                        key={q.originalIndex}
                        onClick={() => setCurrentQuestionIndex(q.originalIndex)}
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all",
                          currentQuestionIndex === q.originalIndex 
                            ? "bg-stone-900 text-white shadow-md scale-110 z-10" 
                            : answers[q.originalIndex] !== -1 
                              ? "bg-emerald-500 text-white shadow-sm" 
                              : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                        )}
                      >
                        {q.originalIndex + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tfQuestions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase mb-3 px-1">Phần 2: Đúng/Sai</p>
                  <div className="grid grid-cols-5 gap-2">
                    {tfQuestions.map((q) => (
                      <button
                        key={q.originalIndex}
                        onClick={() => setCurrentQuestionIndex(q.originalIndex)}
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all",
                          currentQuestionIndex === q.originalIndex 
                            ? "bg-stone-900 text-white shadow-md scale-110 z-10" 
                            : "bg-emerald-500 text-white shadow-sm"
                        )}
                      >
                        {q.originalIndex + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-stone-100 grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-stone-500 font-medium">Đã chọn</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-stone-100" />
                <span className="text-[10px] text-stone-500 font-medium">Chưa chọn</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
