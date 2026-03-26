import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Result, User } from '../types';
import { Trophy, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, ChevronRight, BookOpen, User as UserIcon, School, Eye, Trash2, Search, Filter } from 'lucide-react';
import { formatDate, cn } from '../lib/utils';
import ReviewQuiz from '../components/ReviewQuiz';
import { deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface ResultsProps {
  user: User;
}

export default function Results({ user }: ResultsProps) {
  const [results, setResults] = useState<Result[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allQuizzes, setAllQuizzes] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [reviewingResult, setReviewingResult] = useState<Result | null>(null);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Filters
  const [filterSchool, setFilterSchool] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStudent, setFilterStudent] = useState('');

  // Derived filter options from system (all users)
  const schools = Array.from(new Set(allUsers.map(u => u.school).filter(Boolean))).sort();
  
  const classes = Array.from(new Set(
    allUsers
      .filter(u => !filterSchool || u.school === filterSchool)
      .map(u => u.class)
      .filter(Boolean)
  )).sort();

  const students = Array.from(new Set(
    results
      .filter(r => (!filterSchool || r.studentSchool === filterSchool) && (!filterClass || r.studentClass === filterClass))
      .map(r => r.studentName)
      .filter(Boolean)
  )).sort();

  const filteredResults = results.filter(r => {
    const matchSchool = !filterSchool || r.studentSchool === filterSchool;
    const matchClass = !filterClass || r.studentClass === filterClass;
    const matchStudent = !filterStudent || r.studentName === filterStudent;
    return matchSchool && matchClass && matchStudent;
  });

  const handleDeleteResults = async (ids: string[]) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${ids.length} kết quả đã chọn?`)) return;
    
    setDeleting(true);
    try {
      const batch = writeBatch(db);
      
      ids.forEach(id => {
        batch.delete(doc(db, 'results', id));
      });
      
      await batch.commit();
      setSelectedResults([]);
      toast.success(`Đã xóa ${ids.length} kết quả.`);
    } catch (error) {
      console.error('Error deleting results:', error);
      handleFirestoreError(error, OperationType.DELETE, 'results');
      toast.error('Có lỗi xảy ra khi xóa kết quả.');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedResults.length === filteredResults.length) {
      setSelectedResults([]);
    } else {
      setSelectedResults(filteredResults.map(r => r.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedResults(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    const q = (user.role === 'admin' || user.role === 'teacher')
      ? query(collection(db, 'results'), orderBy('completedAt', 'desc'))
      : query(collection(db, 'results'), where('studentUid', '==', user.uid), orderBy('completedAt', 'desc'));

    const unsubscribeResults = onSnapshot(q, (snapshot) => {
      const resultList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Result[];
      setResults(resultList);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to results:", error);
      handleFirestoreError(error, OperationType.GET, 'results');
      setLoading(false);
    });

    const quizzesQ = query(collection(db, 'quizzes'));
    const unsubscribeQuizzes = onSnapshot(quizzesQ, (snapshot) => {
      const quizMap: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        quizMap[doc.id] = doc.data();
      });
      setAllQuizzes(quizMap);
    }, (error) => {
      console.error("Error listening to quizzes:", error);
    });

    let unsubscribeUsers = () => {};
    if (user.role === 'admin' || user.role === 'teacher') {
      const usersQ = query(collection(db, 'users'));
      unsubscribeUsers = onSnapshot(usersQ, (snapshot) => {
        const userList = snapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        })) as User[];
        setAllUsers(userList);
      }, (error) => {
        console.error("Error listening to users:", error);
        handleFirestoreError(error, OperationType.GET, 'users');
      });
    }

    return () => {
      unsubscribeResults();
      unsubscribeQuizzes();
      unsubscribeUsers();
    };
  }, [user]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-serif font-medium text-stone-900 mb-2 italic">Kết quả học tập</h1>
          <p className="text-stone-500">Xem lại các bài thi đã thực hiện và điểm số của bạn.</p>
        </div>
        
        <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Trophy className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Trung bình</p>
            <p className="text-2xl font-serif italic font-bold text-emerald-900">
              {filteredResults.length > 0 
                ? (filteredResults.reduce((acc, r) => acc + r.score, 0) / filteredResults.length).toFixed(1)
                : '0.0'}
            </p>
          </div>
        </div>
      </div>

      {(user.role === 'admin' || user.role === 'teacher') && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <School className="w-3 h-3" />
              Lọc theo Trường
            </label>
            <select
              value={filterSchool}
              onChange={(e) => {
                setFilterSchool(e.target.value);
                setFilterClass('');
                setFilterStudent('');
              }}
              className="w-full px-4 py-2 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none"
            >
              <option value="">Tất cả trường</option>
              {schools.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <BookOpen className="w-3 h-3" />
              Lọc theo Lớp
            </label>
            <select
              value={filterClass}
              onChange={(e) => {
                setFilterClass(e.target.value);
                setFilterStudent('');
              }}
              disabled={!filterSchool && schools.length > 0}
              className="w-full px-4 py-2 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none disabled:opacity-50"
            >
              <option value="">Tất cả lớp</option>
              {classes.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <UserIcon className="w-3 h-3" />
              Lọc theo Học sinh
            </label>
            <select
              value={filterStudent}
              onChange={(e) => setFilterStudent(e.target.value)}
              disabled={!filterClass && classes.length > 0}
              className="w-full px-4 py-2 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none disabled:opacity-50"
            >
              <option value="">Tất cả học sinh</option>
              {students.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-stone-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredResults.length > 0 ? (
        <div className="space-y-4">
          {(user.role === 'admin' || user.role === 'teacher') && (
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleSelectAll}
                  className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
                >
                  {selectedResults.length === filteredResults.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
                <span className="text-sm text-stone-400">
                  Đã chọn {selectedResults.length} / {filteredResults.length} kết quả
                </span>
              </div>
              {selectedResults.length > 0 && (
                <button
                  onClick={() => handleDeleteResults(selectedResults)}
                  disabled={deleting}
                  className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Xóa {selectedResults.length} kết quả
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {filteredResults.map((result) => (
              <motion.div 
                key={result.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group bg-white rounded-2xl border border-stone-200 p-6 hover:shadow-lg hover:shadow-stone-200/40 transition-all flex flex-col md:flex-row md:items-center gap-6 relative"
              >
                {(user.role === 'admin' || user.role === 'teacher') && (
                  <div className="absolute top-4 right-4 md:static md:mr-2">
                    <input
                      type="checkbox"
                      checked={selectedResults.includes(result.id)}
                      onChange={() => toggleSelect(result.id)}
                      className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </div>
                )}
                
                <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 font-serif italic text-2xl font-bold",
                result.score >= 8 ? "bg-emerald-100 text-emerald-700" : 
                result.score >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
              )}>
                {result.score}
              </div>

              <div className="flex-grow">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-4 h-4 text-stone-400" />
                  <h3 className="text-lg font-medium text-stone-900 break-normal min-w-0">{result.quizTitle || "Bài thi trắc nghiệm"}</h3>
                  {result.subject && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 rounded text-stone-500 font-bold uppercase tracking-tighter">
                      {result.subject}
                    </span>
                  )}
                  {result.topic && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 rounded text-emerald-600 font-bold uppercase tracking-tighter">
                      {result.topic === 'regular' ? 'Thường xuyên' : result.topic === 'periodic' ? 'Định kỳ' : 'Giải đề'}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {formatDate(result.completedAt)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    {result.correctAnswers} / {result.totalQuestions} câu đúng
                  </span>
                  {(user.role === 'admin' || user.role === 'teacher') && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="flex items-center gap-1.5 font-medium text-stone-700">
                        <UserIcon className="w-4 h-4" />
                        {result.studentName}
                      </span>
                      {result.studentClass && (
                        <span className="flex items-center gap-1.5 text-stone-500">
                          <BookOpen className="w-3.5 h-3.5" />
                          Lớp: {result.studentClass}
                        </span>
                      )}
                      {result.studentSchool && (
                        <span className="flex items-center gap-1.5 text-stone-500">
                          <School className="w-3.5 h-3.5" />
                          Trường: {result.studentSchool}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {(() => {
                  const quiz = allQuizzes[result.quizId];
                  const canReview = user.role === 'admin' || user.role === 'teacher' || (quiz?.reviewRoles?.includes(user.role) ?? true);
                  
                  if (!canReview) return (
                    <div className="text-xs text-stone-400 italic">Không được phép xem lại</div>
                  );

                  return (
                    <button
                      onClick={() => setReviewingResult(result)}
                      className="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-600 px-4 py-2 rounded-xl font-bold text-sm transition-all"
                    >
                      <Eye className="w-4 h-4" />
                      Xem lại
                    </button>
                  );
                })()}
                {(user.role === 'admin' || user.role === 'teacher') && (
                  <button
                    onClick={() => handleDeleteResults([result.id])}
                    disabled={deleting}
                    className="p-2 text-stone-300 hover:text-red-600 transition-colors disabled:opacity-50"
                    title="Xóa kết quả"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <div className="w-32 h-2 bg-stone-100 rounded-full overflow-hidden hidden sm:block">
                  <div 
                    className={cn(
                      "h-full transition-all duration-500",
                      result.score >= 8 ? "bg-emerald-500" : 
                      result.score >= 5 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${(result.score / 10) * 100}%` }}
                  />
                </div>
                <button className="p-2 text-stone-300 hover:text-stone-900 transition-colors">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    ) : (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
          <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-stone-300" />
          </div>
          <h3 className="text-lg font-medium text-stone-900">Chưa có kết quả nào</h3>
          <p className="text-stone-500">Hãy bắt đầu làm bài thi đầu tiên của bạn ngay hôm nay.</p>
        </div>
      )}

      {reviewingResult && (
        <ReviewQuiz 
          result={reviewingResult} 
          onClose={() => setReviewingResult(null)} 
          user={user}
        />
      )}
    </div>
  );
}
