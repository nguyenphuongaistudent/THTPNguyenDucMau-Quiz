import React, { useState, useEffect, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { collection, getDocs, addDoc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Quiz, Question, User, Result } from '../types';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Loader2, Send, X } from 'lucide-react';
import { formatDuration, cn } from '../lib/utils';
import RichText from '../components/RichText';
import { toast } from 'sonner';

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
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const lastViolationTime = useRef<number>(0);

  useEffect(() => {
    if (!isStarted || submitting || !quiz) return;

    const settings = quiz.securitySettings || {
      preventTabSwitch: false,
      maxViolations: 0,
      autoSubmitOnMaxViolations: false,
      showWarningOnViolation: true
    };

    const recordViolation = (reason: string) => {
      if (!settings.preventTabSwitch) return;

      const now = Date.now();
      // Prevent double counting if events fire within 500ms
      if (now - lastViolationTime.current < 500) return;
      
      lastViolationTime.current = now;
      setViolationCount(prev => {
        const newCount = prev + 1;
        if (settings.showWarningOnViolation) {
          setShowViolationWarning(true);
        }
        return newCount;
      });
    };

    // 1. Prevent Tab Switching / Leaving the window
    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordViolation('Bạn đã rời khỏi trang làm bài');
      }
    };

    const handleBlur = () => {
      recordViolation('Bạn đã chuyển sang ứng dụng khác hoặc thu nhỏ trình duyệt');
    };

    // 2. Prevent Copy/Cut/Paste/ContextMenu
    const preventDefault = (e: Event) => e.preventDefault();
    
    // 3. Prevent Keyboard Shortcuts (Ctrl+C, Ctrl+V, Ctrl+P, Ctrl+S, Ctrl+Shift+I, F12, PrintScreen)
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      
      // Block Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+P, Ctrl+S, Ctrl+U, Ctrl+Shift+I
      if (isCtrl && ['c', 'v', 'x', 'p', 's', 'u', 'i'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return false;
      }

      // Block F12
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }

      // Block PrintScreen (Note: Hard to block completely, but we can try)
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        recordViolation('Hành vi chụp màn hình bị cấm');
        return false;
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('copy', preventDefault);
    window.addEventListener('cut', preventDefault);
    window.addEventListener('paste', preventDefault);
    window.addEventListener('contextmenu', preventDefault);
    window.addEventListener('keydown', handleKeyDown);

    // Add CSS class to body to prevent selection if tab switch prevention is on
    if (quiz.securitySettings?.preventTabSwitch) {
      document.body.classList.add('select-none');
    }

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('copy', preventDefault);
      window.removeEventListener('cut', preventDefault);
      window.removeEventListener('paste', preventDefault);
      window.removeEventListener('contextmenu', preventDefault);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('select-none');
    };
  }, [isStarted, submitting, quiz]);

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
          
          const questionsSnapshot = await getDocs(collection(db, 'quizzes', quizId, 'questions'));
          let questionList = questionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Question[];

          // Sort in memory to handle cases where 'order' might be missing
          questionList.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

          // Filter out hidden questions for non-admins
          if (user.role !== 'admin') {
            questionList = questionList.filter(q => !q.hidden);
          }

          // Seeded random number generator
          const seededRandom = (seed: string) => {
            let h = 0;
            for (let i = 0; i < seed.length; i++) {
              h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
            }
            return () => {
              h = Math.imul(48271, h) | 0;
              return (h >>> 0) / 2147483647;
            };
          };

          const rng = seededRandom(user.uid + quizId + attemptCount);

          // Helper to shuffle array with seeded RNG
          const shuffleArray = <T,>(array: T[]): T[] => {
            if (!array || !Array.isArray(array)) return [];
            // Filter out any undefined/null elements that might have crept in
            const cleanArr = array.filter(item => item !== undefined && item !== null);
            const newArr = [...cleanArr];
            for (let i = newArr.length - 1; i > 0; i--) {
              const j = Math.floor(rng() * (i + 1));
              [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
            }
            return newArr;
          };

          const settings = quizData.securitySettings || {
            preventTabSwitch: false,
            maxViolations: 0,
            autoSubmitOnMaxViolations: false,
            showWarningOnViolation: true,
            shuffleQuestions: true,
            shuffleOptions: true
          };

          // Shuffle options within each question
          if (settings.shuffleOptions !== false) {
            questionList = questionList.map(q => {
              if (!q) return q;
              if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
                const optionsWithCorrect = q.options
                  .filter(opt => opt !== undefined && opt !== null)
                  .map((opt, idx) => ({
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
              if (q.type === 'true_false' && Array.isArray(q.options) && Array.isArray(q.correctAnswers)) {
                const optionsWithAnswers = q.options
                  .filter(opt => opt !== undefined && opt !== null)
                  .map((opt, idx) => ({
                    text: opt,
                    answer: q.correctAnswers![idx]
                  }));
                const shuffledOptions = shuffleArray(optionsWithAnswers);
                return {
                  ...q,
                  options: shuffledOptions.map(o => o.text),
                  correctAnswers: shuffledOptions.map(o => o.answer)
                };
              }
              return q;
            }).filter(q => q !== undefined && q !== null);
          }

          // Shuffle questions within their parts (MC first, then TF)
          let finalQuestions = questionList.filter(q => q !== undefined && q !== null);
          if (settings.shuffleQuestions !== false) {
            const mcQuestions = shuffleArray(finalQuestions.filter(q => q && q.type === 'multiple_choice'));
            const tfQuestions = shuffleArray(finalQuestions.filter(q => q && q.type === 'true_false')); 
            finalQuestions = [...mcQuestions, ...tfQuestions];
          }

          setQuestions(finalQuestions);
          setAnswers(new Array(finalQuestions.length).fill(-1).map((_, i) => {
            const q = finalQuestions[i];
            if (!q) return -1;
            return q.type === 'true_false' ? [null, null, null, null] : -1;
          }));
          setReviewed(new Array(finalQuestions.length).fill(false));
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

  const handleSubmit = useCallback(async (isAutoSubmit = false) => {
    if (submitting) return;
    
    if (!isAutoSubmit && !showSubmitConfirm) {
      setShowSubmitConfirm(true);
      return;
    }

    setSubmitting(true);
    setShowSubmitConfirm(false);

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

      const submissionPromise = addDoc(collection(db, 'results'), {
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
        answers: sanitizedAnswers,
        shuffledQuestions: questions,
        violationCount: violationCount
      });

      toast.promise(submissionPromise, {
        loading: 'Đang nộp bài thi...',
        success: () => {
          onComplete();
          return 'Nộp bài thành công!';
        },
        error: (err) => {
          console.error('Error submitting quiz:', err);
          handleFirestoreError(err, OperationType.WRITE, 'results');
          return 'Có lỗi xảy ra khi nộp bài. Vui lòng thử lại.';
        }
      });

      await submissionPromise;
    } catch (error) {
      // Errors are handled by toast.promise
    } finally {
      setSubmitting(false);
    }
  }, [submitting, questions, answers, quiz, user, quizId, onComplete, violationCount, showSubmitConfirm]);

  useEffect(() => {
    if (!isStarted || submitting || !quiz) return;
    
    const settings = quiz.securitySettings;
    if (settings?.maxViolations && settings.maxViolations > 0 && violationCount >= settings.maxViolations && settings.autoSubmitOnMaxViolations) {
      toast.error(`Bạn đã vi phạm ${violationCount} lần (vượt quá giới hạn ${settings.maxViolations}). Bài thi sẽ tự động nộp!`, {
        duration: 5000,
        position: 'top-center'
      });
      handleSubmit(true);
    }
  }, [violationCount, quiz, isStarted, submitting, handleSubmit]);

  useEffect(() => {
    if (!isStarted || timeLeft <= 0) {
      if (isStarted && timeLeft <= 0) handleSubmit(true);
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
          <h2 className="text-2xl font-sans font-bold text-blue-950 mb-4">Không thể làm bài thi</h2>
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

  if (questions.length === 0 && loading === false) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center shadow-xl shadow-stone-200/50">
          <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <AlertCircle className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-2xl font-sans font-bold text-stone-900 mb-4">Bài thi chưa có câu hỏi</h2>
          <p className="text-stone-500 mb-8 leading-relaxed">Vui lòng quay lại sau hoặc liên hệ quản trị viên để biết thêm chi tiết.</p>
          <button
            onClick={onCancel}
            className="w-full sm:w-auto bg-stone-900 text-white py-4 px-12 rounded-2xl hover:bg-stone-800 transition-all font-medium shadow-lg shadow-stone-200"
          >
            Quay lại trang chủ
          </button>
        </div>
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="max-w-2xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center shadow-sm">
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <Clock className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-xl font-sans font-bold text-blue-950 mb-4">{quiz.title}</h1>
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
  
  if (!currentQuestion) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="bg-white rounded-3xl border border-stone-200 p-10 shadow-sm">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-stone-900 mb-2">Lỗi hiển thị câu hỏi</h2>
          <p className="text-stone-500 mb-6">Không thể tải nội dung câu hỏi hiện tại.</p>
          <button
            onClick={onCancel}
            className="px-8 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-all font-medium"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const answeredCount = answers.filter((a, i) => {
    const q = questions[i];
    if (!q) return false;
    if (q.type === 'multiple_choice') {
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
              <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center text-white font-sans font-bold">
                {currentQuestionIndex + 1}
              </div>
              <div>
                <h2 className="text-xs font-medium text-stone-900">{quiz.title}</h2>
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
                className="text-sm sm:text-base font-arial text-stone-900 mb-4 leading-relaxed break-normal w-full"
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
                          "text-sm sm:text-base font-arial transition-colors flex-1 min-w-0 break-normal w-full text-left",
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
                            className="text-stone-700 text-sm sm:text-base font-arial flex-1 min-w-0 leading-relaxed max-w-none break-normal w-full text-left"
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
                  onClick={() => handleSubmit()}
                  disabled={submitting}
                  translate="no"
                  className="flex items-center gap-2 bg-emerald-600 text-white py-2 px-6 rounded-xl hover:bg-emerald-700 transition-all font-medium shadow-lg shadow-emerald-200 disabled:opacity-50 text-sm"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span translate="no">Nộp bài</span>
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
                  timeLeft < 300 ? "text-red-600 font-extrabold animate-pulse" : "text-slate-500"
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
                onClick={() => handleSubmit()}
                disabled={submitting}
                translate="no"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-6 rounded-xl font-bold text-base shadow-lg shadow-emerald-200 transition-all active:scale-[0.98] disabled:opacity-50 mb-6 uppercase tracking-wider flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Nộp bài</span>
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

        {showViolationWarning && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-red-100 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-2xl font-bold text-stone-900 text-center mb-2">Cảnh báo vi phạm!</h3>
              <p className="text-stone-600 text-center mb-6">
                Bạn vừa rời khỏi màn hình làm bài thi. Hành động này đã được ghi lại. 
                Vui lòng tập trung làm bài và không chuyển tab hoặc mở ứng dụng khác.
              </p>
              <div className="bg-red-50 rounded-2xl p-4 mb-6 border border-red-100">
                <p className="text-red-700 text-sm font-medium text-center">
                  Số lần vi phạm: <span className="text-lg font-bold">{violationCount}</span>
                  {quiz?.securitySettings?.maxViolations ? (
                    <span className="text-stone-400 font-normal"> / {quiz.securitySettings.maxViolations}</span>
                  ) : null}
                </p>
                {quiz?.securitySettings?.autoSubmitOnMaxViolations && quiz?.securitySettings?.maxViolations ? (
                  <p className="text-[10px] text-red-500 text-center mt-1 uppercase font-bold tracking-wider">
                    Bài thi sẽ tự động nộp nếu vi phạm quá {quiz.securitySettings.maxViolations} lần
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => setShowViolationWarning(false)}
                className="w-full bg-stone-900 text-white py-3 rounded-xl font-bold hover:bg-stone-800 transition-all shadow-lg"
              >
                Tôi đã hiểu và tiếp tục làm bài
              </button>
            </div>
          </div>
        )}

        {showSubmitConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-emerald-100 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Send className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-stone-900 text-center mb-2">Xác nhận nộp bài?</h3>
              <p className="text-stone-600 text-center mb-8 leading-relaxed">
                Bạn đã hoàn thành <span className="font-bold text-emerald-600">{answeredCount}/{questions.length}</span> câu hỏi. 
                Bạn có chắc chắn muốn nộp bài thi ngay bây giờ? Sau khi nộp, bạn sẽ không thể thay đổi câu trả lời.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowSubmitConfirm(false)}
                  className="py-3 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition-all"
                >
                  Kiểm tra lại
                </button>
                <button
                  onClick={() => handleSubmit(false)}
                  className="bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                >
                  Xác nhận nộp
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
