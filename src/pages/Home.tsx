import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Quiz, User, Result } from '../types';
import { Clock, ChevronRight, BookOpen, Search, Filter, AlertCircle, CheckCircle2, UserCircle, School, Save, Loader2, XCircle, Settings } from 'lucide-react';
import { setDoc, doc } from 'firebase/firestore';
import { formatDuration, formatDate, cn } from '../lib/utils';

interface HomeProps {
  user: User;
  onTakeQuiz: (quizId: string) => void;
}

export default function Home({ user, onTakeQuiz }: HomeProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [userResults, setUserResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | 'all'>('all');
  const [selectedTopic, setSelectedTopic] = useState<string | 'all'>('all');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ displayName: user.displayName || '', school: user.school || '', class: user.class || '' });
  const [saving, setSaving] = useState(false);

  const subjects = ['Toán', 'Vật lý', 'Hóa học', 'Sinh học', 'Tiếng Anh', 'Lịch sử', 'Địa lý', 'GDCD', 'Ngữ văn', 'Tin học'];
  const topics = [
    { id: 'regular', label: 'Kiểm tra thường xuyên' },
    { id: 'periodic', label: 'Kiểm tra định kỳ' },
    { id: 'graduation', label: 'Giải đề TN THPT' }
  ];

  useEffect(() => {
    const q = query(
      collection(db, 'quizzes'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const quizList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Quiz[];
      setQuizzes(quizList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'quizzes');
    });

    // Fetch user results to count attempts
    const resultsQ = query(
      collection(db, 'results'),
      where('userId', '==', user.uid)
    );

    const unsubscribeResults = onSnapshot(resultsQ, (snapshot) => {
      const resultsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Result[];
      setUserResults(resultsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'results');
    });

    return () => {
      unsubscribe();
      unsubscribeResults();
    };
  }, [user.uid]);

  const getAttemptCount = (quizId: string) => {
    return userResults.filter(r => r.quizId === quizId).length;
  };

  const isAttemptLimitReached = (quiz: Quiz) => {
    if (!quiz.maxAttempts || quiz.maxAttempts === 0) return false;
    return getAttemptCount(quiz.id) >= quiz.maxAttempts;
  };

  const isRoleAllowed = (quiz: Quiz) => {
    if (!quiz.allowedRoles || quiz.allowedRoles.length === 0) return true;
    return quiz.allowedRoles.includes(user.role);
  };

  const canTakeQuiz = (quiz: Quiz) => {
    if (user.role === 'admin') return true;
    return quiz.isActive && isRoleAllowed(quiz) && !isAttemptLimitReached(quiz);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        ...profileForm
      }, { merge: true });
      setIsProfileOpen(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Có lỗi xảy ra khi cập nhật thông tin.');
    } finally {
      setSaving(false);
    }
  };

  const filteredQuizzes = quizzes.filter(quiz => {
    const matchesSearch = quiz.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quiz.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSubject = selectedSubject === 'all' || quiz.subject === selectedSubject;
    const matchesTopic = selectedTopic === 'all' || quiz.topic === selectedTopic;
    return matchesSearch && matchesSubject && matchesTopic;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-serif font-medium text-stone-900 italic">Chào mừng, {user.displayName || user.email.split('@')[0]}</h1>
            <button 
              onClick={() => setIsProfileOpen(true)}
              className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all"
              title="Chỉnh sửa thông tin cá nhân"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
          <p className="text-stone-500">
            {user.school ? `${user.school}` : 'Chưa cập nhật trường'} 
            {user.class ? ` - Lớp ${user.class}` : ''}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Tìm kiếm bài thi..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
        <div className="flex items-center gap-2 min-w-[150px]">
          <Filter className="w-4 h-4 text-stone-400" />
          <span className="text-sm font-medium text-stone-700">Lọc theo:</span>
        </div>
        
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          className="text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="all">Tất cả môn học</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={selectedTopic}
          onChange={(e) => setSelectedTopic(e.target.value)}
          className="text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="all">Tất cả chủ đề</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        {(selectedSubject !== 'all' || selectedTopic !== 'all' || searchTerm !== '') && (
          <button
            onClick={() => {
              setSelectedSubject('all');
              setSelectedTopic('all');
              setSearchTerm('');
            }}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 underline underline-offset-4"
          >
            Xóa lọc
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-stone-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredQuizzes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredQuizzes.map((quiz) => {
            const attempts = getAttemptCount(quiz.id);
            const limitReached = isAttemptLimitReached(quiz);
            const roleAllowed = isRoleAllowed(quiz);
            const isActive = quiz.isActive;
            const playable = canTakeQuiz(quiz);
            
            return (
              <div 
                key={quiz.id}
                className={cn(
                  "group bg-white rounded-2xl border border-stone-200 p-6 transition-all flex flex-col",
                  !playable 
                    ? "opacity-75 cursor-not-allowed grayscale-[0.5]" 
                    : "hover:shadow-xl hover:shadow-stone-200/50 hover:-translate-y-1 cursor-pointer"
                )}
                onClick={() => playable && onTakeQuiz(quiz.id)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                      {quiz.subject}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                      {topics.find(t => t.id === quiz.topic)?.label || quiz.topic}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {!isActive && (
                      <div className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-600 uppercase tracking-wider flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Chưa công khai
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 rounded-full text-xs font-medium text-stone-600">
                      <Clock className="w-3 h-3" />
                      {formatDuration(quiz.duration)}
                    </div>
                    {quiz.maxAttempts ? (
                      <div className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                        limitReached ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                      )}>
                        Lượt: {attempts}/{quiz.maxAttempts}
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-50 text-stone-400 uppercase tracking-wider">
                        Lượt: {attempts}/∞
                      </div>
                    )}
                  </div>
                </div>
                
                <h3 className="text-xl font-medium text-stone-900 mb-2 group-hover:text-emerald-700 transition-colors break-words">{quiz.title}</h3>
                <p className="text-stone-500 text-sm line-clamp-2 mb-4 flex-grow break-words">
                  {quiz.description || "Không có mô tả cho bài thi này."}
                </p>
                
                <div className="flex items-center justify-between pt-4 border-t border-stone-50">
                  <span className="text-xs text-stone-400">Cập nhật: {formatDate(quiz.createdAt)}</span>
                  {!isActive ? (
                    <div className="flex items-center gap-1 text-amber-600 font-medium text-sm">
                      <AlertCircle className="w-4 h-4" /> Sắp ra mắt
                    </div>
                  ) : !roleAllowed ? (
                    <div className="flex items-center gap-1 text-stone-400 font-medium text-sm">
                      <XCircle className="w-4 h-4" /> Không dành cho {user.role === 'student' ? 'Học sinh' : 'Khách'}
                    </div>
                  ) : limitReached ? (
                    <div className="flex items-center gap-1 text-red-500 font-medium text-sm">
                      <AlertCircle className="w-4 h-4" /> Hết lượt
                    </div>
                  ) : attempts > 0 ? (
                    <div className="flex items-center gap-1 text-blue-600 font-medium text-sm">
                      Làm lại <ChevronRight className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-emerald-600 font-medium text-sm">
                      Bắt đầu <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
          <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Filter className="w-8 h-8 text-stone-300" />
          </div>
          <h3 className="text-lg font-medium text-stone-900">Không tìm thấy bài thi nào</h3>
          <p className="text-stone-500">Hãy thử tìm kiếm với từ khóa khác hoặc quay lại sau.</p>
        </div>
      )}
      {/* Profile Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => !saving && setIsProfileOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <h2 className="text-xl font-serif italic font-medium">Thông tin cá nhân</h2>
              <button onClick={() => setIsProfileOpen(false)} className="p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateProfile} className="p-8 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <UserCircle className="w-4 h-4" /> Họ và tên
                </label>
                <input
                  type="text"
                  value={profileForm.displayName}
                  onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                  placeholder="Nhập họ và tên"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <School className="w-4 h-4" /> Trường học
                </label>
                <input
                  type="text"
                  value={profileForm.school}
                  onChange={(e) => setProfileForm({ ...profileForm, school: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                  placeholder="Nhập tên trường"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Lớp học
                </label>
                <input
                  type="text"
                  value={profileForm.class}
                  onChange={(e) => setProfileForm({ ...profileForm, class: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                  placeholder="Nhập tên lớp"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex-grow py-3 px-6 rounded-xl text-stone-500 font-medium hover:bg-stone-50 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-grow flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-all font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Cập nhật
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
