import React, { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { collection, getDocs, addDoc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Quiz, Question, User, Result } from '../types';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Loader2, Send, X } from 'lucide-react';
import { cn, formatDuration } from '../lib/utils';
import RichText from '../components/RichText';

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
  const [reviewed, setReviewed] = useState<boolean[]>([]);
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
          where('studentUid', '==', user.uid),
          where('quizId', '==', quizId)
        );
        const resultsSnapshot = await getDocs(resultsQ);
        const attemptCount = resultsSnapshot.size;

        const quizDoc = await getDocs(collection(db, 'quizzes'));
        const foundQuiz = quizDoc.docs.find(doc => doc.id === quizId);
        
        if (foundQuiz) {
          const quizData = { id: foundQuiz.id, ...foundQuiz.data() } as Quiz;
          
          // Determine effective max attempts
          let effectiveMaxAttempts = quizData.maxAttempts || 0;
          
          // Check special attempt limits
          if (quizData.specialAttemptLimits && quizData.specialAttemptLimits.length > 0) {
            // Check student-specific limits first
            const studentLimit = quizData.specialAttemptLimits.find(l => l.type === 'student' && l.targetId === user.uid);
            if (studentLimit) {
              effectiveMaxAttempts = studentLimit.maxAttempts;
            } else {
              // Check class-specific limits
              const classLimit = quizData.specialAttemptLimits.find(l => l.type === 'class' && l.targetId === user.class);
              if (classLimit) {
                effectiveMaxAttempts = classLimit.maxAttempts;
              }
            }
          }

          if (user.role !== 'admin' && effectiveMaxAttempts > 0 && attemptCount >= effectiveMaxAttempts) {
            setAttemptError(`Bạn đã hết lượt làm bài thi này (Tối đa: ${effectiveMaxAttempts} lượt).`);
            setLoading(false);
            return;
          }

          setQuiz(quizData);
          setTimeLeft(foundQuiz.data().duration * 60);
          
          const questionsSnapshot = await getDocs(query(collection(db, 'quizzes', quizId, 'questions'), orderBy('order')));
          let questionList = questionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Question[];

          // Filter out hidden questions for non-admins
          if (user.role !== 'admin') {
            questionList = questionList.filter(q => !q.hidden);
          }

          // Helper to shuffle array
          const shuffleArray = <T,>(array: T[]): T[] => {
            const newArr = [...array];
            for (let i = newArr.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
            }
            return newArr;
          };

          // Shuffle options within each question
          questionList = questionList.map(q => {
            if (q.type === 'multiple_choice' && q.options) {
              const optionsWithCorrect = q.options.map((opt, idx) => ({
                text: opt,
                isCorrect: idx === q.correctOptionIndex
              }));
              const shuffledOptions = shuffleArray(optionsWithCorrect);
              return {
                ...q,
                options: shuffledOptions.map(o => o.text),
                correctOptionIndex: shuffledOptions.findIndex(o => o.isCorrect)
              };
            }
            // True/False questions and their sub-statements are NOT shuffled as per user request
            return q;
          });

          // Shuffle questions within their parts (MC first, then TF)
          const mcQuestions = shuffleArray(questionList.filter(q => q.type === 'multiple_choice'));
          const tfQuestions = questionList.filter(q => q.type === 'true_false'); // Keep original order for Part II
          const shuffledQuestions = [...mcQuestions, ...tfQuestions];

          setQuestions(shuffledQuestions);
          setAnswers(new Array(shuffledQuestions.length).fill(-1).map((_, i) => 
            shuffledQuestions[i].type === 'true_false' ? [null, null, null, null] : -1
          ));
          setReviewed(new Array(shuffledQuestions.length).fill(false));
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

  const stripPrefix = (text: string) => {
    // Remove prefixes like "A. ", "B. ", "1. ", "a. ", etc. from the beginning of the text
    // Also handle HTML tags if they are present at the start
    let cleanText = text.trim();
    
    // If it's HTML, we need to be careful. Let's try to strip from the text content.
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cleanText;
    const firstChild = tempDiv.firstChild;
    
    if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
      firstChild.textContent = firstChild.textContent?.replace(/^[A-Za-z0-9][.)]\s*/, '') || '';
    } else if (firstChild && firstChild.nodeType === Node.ELEMENT_NODE) {
      // Check the first text node inside the first element
      const walker = document.createTreeWalker(firstChild, NodeFilter.SHOW_TEXT, null);
      const firstTextNode = walker.nextNode();
      if (firstTextNode) {
        firstTextNode.textContent = firstTextNode.textContent?.replace(/^[A-Za-z0-9][.)]\s*/, '') || '';
      }
    }
    
    return tempDiv.innerHTML;
  };

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      let totalScore = 0;
      let correctCount = 0;
      const sanitizedAnswers: any[] = [];

      questions.forEach((q, index) => {
        const studentAnswer = answers[index];
        let isCorrect = false;
        if (q.type === 'multiple_choice') {
          if (studentAnswer === q.correctOptionIndex) {
            correctCount++;
            totalScore += (10 / questions.length);
            isCorrect = true;
          }
        } else if (q.type === 'true_false' && Array.isArray(studentAnswer)) {
          let subCorrectCount = 0;
          q.correctAnswers?.forEach((correct, i) => {
            if (studentAnswer[i] === correct) {
              subCorrectCount++;
            }
          });

          let questionWeight = 10 / questions.length;
          if (subCorrectCount === 1) totalScore += questionWeight * 0.1;
          else if (subCorrectCount === 2) totalScore += questionWeight * 0.25;
          else if (subCorrectCount === 3) totalScore += questionWeight * 0.5;
          else if (subCorrectCount === 4) {
            totalScore += questionWeight * 1.0;
            correctCount++;
            isCorrect = true;
          }
        }

        // Prepare sanitized answer
        let sanitizedVal: any;
        if (Array.isArray(studentAnswer)) {
          sanitizedVal = studentAnswer.map(v => v === undefined ? null : v);
        } else {
          sanitizedVal = studentAnswer === undefined ? -1 : studentAnswer;
        }

        sanitizedAnswers.push({
          questionId: q.id,
          val: sanitizedVal,
          isCorrect
        });
      });

      await addDoc(collection(db, 'results'), {
        quizId,
        quizTitle: quiz?.title || 'Bài thi không tên',
        subject: quiz?.subject || 'Chưa rõ',
        topic: quiz?.topic || 'regular',
        studentUid: user.uid,
        studentName: user.displayName || user.email || 'Thí sinh',
        studentSchool: user.school || '',
        studentClass: user.class || '',
        score: Number(totalScore.toFixed(2)),
        totalQuestions: questions.length,
        correctAnswers: correctCount,
        completedAt: serverTimestamp(),
        answers: sanitizedAnswers
      });

      onComplete();
    } catch (error) {
      console.error('Error submitting quiz:', error);
      handleFirestoreError(error, OperationType.WRITE, 'results');
      alert('Có lỗi xảy ra khi nộp bài. Vui lòng thử lại.');
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
    const currentTFAnswers = [...(newAnswers[currentQuestionIndex] as (boolean | null)[] || [null, null, null, null])];
    currentTFAnswers[subIndex] = value;
    newAnswers[currentQuestionIndex] = currentTFAnswers;
    setAnswers(newAnswers);
  };

  const toggleReviewed = () => {
    const newReviewed = [...reviewed];
    newReviewed[currentQuestionIndex] = !newReviewed[currentQuestionIndex];
    setReviewed(newReviewed);
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

  const answeredCount = answers.filter((a, i) => {
    if (questions[i].type === 'multiple_choice') {
      return a !== -1;
    } else {
      return (a as (boolean | null)[]).some(val => val !== null);
    }
  }).length;

  const hours = Math.floor(timeLeft / 3600);
  const mins = Math.floor((timeLeft % 3600) / 60);
  const secs = timeLeft % 60;
  const timeString = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pt-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Question Area */}
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* Quiz Header - Inside the column to match width */}
          <div className="sticky top-[72px] z-40 bg-white/80 backdrop-blur-md border border-stone-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center text-white font-serif italic font-bold">
                {currentQuestionIndex + 1}
              </div>
              <div>
                <h2 className="text-sm font-medium text-stone-900">{quiz.title}</h2>
                <div className="w-48 h-1.5 bg-stone-100 rounded-full mt-1 overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Question Card */}
          <div className="bg-white rounded-3xl border border-stone-200 p-4 sm:p-6 md:p-8 shadow-sm min-h-[350px] flex flex-col text-left">
            <div className="flex-grow min-w-0 break-normal whitespace-pre-wrap text-left">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                  {currentQuestion.type === 'multiple_choice' ? 'Phần I: Câu hỏi nhiều lựa chọn' : 'Phần II: Câu hỏi đúng sai'}
                </p>
                <button 
                  onClick={toggleReviewed}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold transition-all border shadow-sm",
                    reviewed[currentQuestionIndex] 
                      ? "bg-[#8e44ad] text-white border-[#8e44ad] ring-2 ring-purple-200" 
                      : "bg-[#a569bd] text-white border-[#a569bd] hover:bg-[#9b59b6]"
                  )}
                >
                  <AlertCircle className="w-3 h-3" />
                  Sẽ kiểm tra lại sau
                </button>
              </div>
              <RichText 
                className="text-lg sm:text-xl font-sans font-medium text-stone-900 mb-4 leading-relaxed break-normal whitespace-normal w-full"
                content={stripPrefix(currentQuestion.text)}
              />
              <div className="grid grid-cols-1 gap-2">
                {currentQuestion.type === 'multiple_choice' ? (
                  currentQuestion.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelect(index)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all group",
                        answers[currentQuestionIndex] === index 
                          ? "border-emerald-500 bg-emerald-50/30 ring-4 ring-emerald-500/5" 
                          : "border-stone-100 hover:border-stone-200 hover:bg-stone-50"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors",
                        answers[currentQuestionIndex] === index 
                          ? "bg-emerald-500 text-white" 
                          : "bg-stone-100 text-stone-500 group-hover:bg-stone-200"
                      )}>
                        {String.fromCharCode(65 + index)}
                      </div>
                      <RichText 
                        className={cn(
                          "text-sm sm:text-base font-sans font-light transition-colors flex-1 min-w-0 break-normal whitespace-pre-wrap w-full text-left",
                          answers[currentQuestionIndex] === index ? "text-emerald-900" : "text-stone-700"
                        )}
                        content={stripPrefix(option)}
                      />
                    </button>
                  ))
                ) : (
                  <div className="space-y-3">
                    {['A', 'B', 'C', 'D'].map((label, index) => (
                      <div key={index} className="flex flex-col sm:flex-row sm:items-start justify-between p-3 rounded-2xl border border-stone-100 bg-stone-50/30 gap-3">
                        <div className="flex items-start gap-3 flex-grow min-w-0">
                          <div className="w-6 h-6 rounded-lg bg-stone-200 flex items-center justify-center text-[10px] font-bold text-stone-500 shrink-0 mt-0.5 uppercase">
                            {label}
                          </div>
                          <RichText 
                            className="text-stone-700 text-xs sm:text-sm font-sans font-light flex-1 leading-relaxed prose prose-stone max-w-none break-normal whitespace-pre-wrap w-full text-left"
                            content={stripPrefix(currentQuestion.options[index])}
                          />
                        </div>
                        <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-stone-200 shadow-sm shrink-0">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="radio"
                              name={`q-${currentQuestionIndex}-o-${index}`}
                              checked={(answers[currentQuestionIndex] as boolean[])?.[index] === true}
                              onChange={() => handleTFAnswerSelect(index, true)}
                              className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 border-stone-300"
                            />
                            <span className={cn("text-sm font-bold transition-colors", (answers[currentQuestionIndex] as boolean[])?.[index] === true ? "text-emerald-600" : "text-stone-400 group-hover:text-stone-600")}>Đúng</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="radio"
                              name={`q-${currentQuestionIndex}-o-${index}`}
                              checked={(answers[currentQuestionIndex] as boolean[])?.[index] === false}
                              onChange={() => handleTFAnswerSelect(index, false)}
                              className="w-5 h-5 text-red-600 focus:ring-red-500 border-stone-300"
                            />
                            <span className={cn("text-sm font-bold transition-colors", (answers[currentQuestionIndex] as boolean[])?.[index] === false ? "text-red-600" : "text-stone-400 group-hover:text-stone-600")}>Sai</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-stone-50">
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
                  className="flex items-center gap-2 bg-emerald-600 text-white py-2 px-6 rounded-xl hover:bg-emerald-700 transition-all font-medium shadow-lg shadow-emerald-200 disabled:opacity-50 text-sm"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Nộp bài
                </button>
              ) : (
                <button
                  onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
                  className="flex items-center gap-2 bg-stone-900 text-white py-2 px-6 rounded-xl hover:bg-stone-800 transition-all font-medium shadow-lg shadow-stone-200 text-sm"
                >
                  Tiếp theo <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Question Navigator Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl border border-stone-200 p-0 shadow-sm sticky top-[72px] overflow-hidden">
            {/* Sidebar Header */}
            <div className="grid grid-cols-2 border-b border-stone-100">
              <div className="p-3 text-center border-r border-stone-100">
                <p className="text-xs font-medium text-stone-500 mb-1">Số câu đã làm</p>
                <p className="text-xl font-bold text-stone-900">{answeredCount}/{questions.length}</p>
              </div>
              <div className="p-3 text-center">
                <p className="text-xs font-medium text-stone-500 mb-1">Thời gian còn lại</p>
                <p className={cn(
                  "text-xl font-bold whitespace-nowrap",
                  timeLeft < 60 ? "text-red-600" : "text-slate-500"
                )}>
                  {timeString}
                </p>
              </div>
            </div>

            {/* Question Grid */}
            <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
              {/* Part I: Multiple Choice */}
              {questions.some(q => q.type === 'multiple_choice') && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Phần I. Câu hỏi nhiều lựa chọn</p>
                  <div className="grid grid-cols-6 gap-2">
                    {questions.map((q, index) => {
                      if (q.type !== 'multiple_choice') return null;
                      const isAnswered = answers[index] !== -1;
                      const isReviewed = reviewed[index];
                      
                      return (
                        <button
                          key={index}
                          onClick={() => setCurrentQuestionIndex(index)}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all border",
                            currentQuestionIndex === index 
                              ? "ring-2 ring-stone-900 ring-offset-1 z-10" 
                              : "",
                            isReviewed
                              ? "bg-[#a569bd] text-white border-[#a569bd]"
                              : isAnswered
                                ? "bg-[#00a651] text-white border-[#00a651]" 
                                : "bg-white text-stone-900 border-stone-200 hover:border-stone-400"
                          )}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Part II: True/False */}
              {questions.some(q => q.type === 'true_false') && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Phần II. Câu hỏi đúng sai</p>
                  <div className="grid grid-cols-6 gap-2">
                    {questions.map((q, index) => {
                      if (q.type !== 'true_false') return null;
                      const isAnswered = (answers[index] as (boolean | null)[]).some(a => a !== null);
                      const isReviewed = reviewed[index];
                      
                      return (
                        <button
                          key={index}
                          onClick={() => setCurrentQuestionIndex(index)}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all border",
                            currentQuestionIndex === index 
                              ? "ring-2 ring-stone-900 ring-offset-1 z-10" 
                              : "",
                            isReviewed
                              ? "bg-[#a569bd] text-white border-[#a569bd]"
                              : isAnswered
                                ? "bg-[#00a651] text-white border-[#00a651]" 
                                : "bg-white text-stone-900 border-stone-200 hover:border-stone-400"
                          )}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button Section */}
            <div className="p-6 pt-0 flex flex-col items-center">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-[#f39c12] hover:bg-[#e67e22] text-white py-2.5 px-6 rounded-full font-bold text-base shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 mb-6 uppercase tracking-wider"
              >
                {submitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Nộp bài"}
              </button>

              {/* Legend */}
              <div className="w-full space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#00a651]" />
                  <span className="text-sm text-stone-700 font-medium">Câu đã làm</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full border border-stone-200 bg-white" />
                  <span className="text-sm text-stone-700 font-medium">Câu chưa làm</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#a569bd]" />
                  <span className="text-sm text-stone-700 font-medium">Câu sẽ kiểm tra lại sau</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
