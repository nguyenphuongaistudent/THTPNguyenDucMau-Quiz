import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, setDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, updateUserEmail, updateUserPassword, reauthenticateUser } from '../firebase';
import { Quiz, User, Result } from '../types';
import { Clock, ChevronRight, BookOpen, Search, Filter, AlertCircle, CheckCircle2, UserCircle, School, Save, Loader2, XCircle, Settings, Key, Mail, GripVertical } from 'lucide-react';
import { formatDuration, formatDate, cn } from '../lib/utils';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

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
  const [profileForm, setProfileForm] = useState({ 
    displayName: user.displayName || '', 
    school: user.school || '', 
    class: user.class || '',
    email: user.email || '',
    newPassword: '',
    currentPassword: ''
  });
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
      
      // Sort by status (for students), then by order, then by createdAt
      const sortedQuizzes = quizList.sort((a, b) => {
        // If not admin, prioritize isActive (open quizzes first)
        if (user.role !== 'admin') {
          if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
          }
        }

        const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        
        const dateA = (a.createdAt as any)?.toDate?.() || new Date(0);
        const dateB = (b.createdAt as any)?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setQuizzes(sortedQuizzes);
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

  const getEffectiveMaxAttempts = (quiz: Quiz) => {
    let maxAttempts = quiz.maxAttempts || 0;
    
    if (quiz.specialAttemptLimits && quiz.specialAttemptLimits.length > 0) {
      const studentLimit = quiz.specialAttemptLimits.find(l => l.type === 'student' && l.targetId === user.uid);
      if (studentLimit) {
        maxAttempts = studentLimit.maxAttempts;
      } else {
        const classLimit = quiz.specialAttemptLimits.find(l => l.type === 'class' && l.targetId === user.class);
        if (classLimit) {
          maxAttempts = classLimit.maxAttempts;
        }
      }
    }
    return maxAttempts;
  };

  const isAttemptLimitReached = (quiz: Quiz) => {
    const maxAttempts = getEffectiveMaxAttempts(quiz);
    if (maxAttempts === 0) return false;
    return getAttemptCount(quiz.id) >= maxAttempts;
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || user.role !== 'admin') return;

    const items = Array.from(quizzes);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update state immediately for smooth UI
    setQuizzes(items);

    // Update Firestore
    try {
      const batch = writeBatch(db);
      items.forEach((quiz, index) => {
        const quizRef = doc(db, 'quizzes', quiz.id);
        batch.update(quizRef, { order: index });
      });
      await batch.commit();
      toast.success('Đã cập nhật thứ tự bài thi');
    } catch (error) {
      console.error('Error updating quiz order:', error);
      toast.error('Không thể cập nhật thứ tự bài thi');
    }
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
    
    if (!profileForm.currentPassword) {
      toast.error('Vui lòng nhập mật khẩu hiện tại để xác nhận thay đổi.');
      return;
    }

    setSaving(true);
    try {
      // 1. Re-authenticate first
      await reauthenticateUser(profileForm.currentPassword);

      // 2. Update Auth email if changed
      let emailChanged = false;
      if (profileForm.email !== user.email) {
        await updateUserEmail(profileForm.email);
        emailChanged = true;
      }
      
      // 3. Update Auth password if provided
      if (profileForm.newPassword) {
        if (profileForm.newPassword.length < 6) {
          throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự.');
        }
        await updateUserPassword(profileForm.newPassword);
      }

      // 4. Update Firestore fields (Admins can update all, members only email/metadata)
      const updateData: any = {
        updatedAt: serverTimestamp()
      };

      // If email changed, we don't update Firestore yet because it's pending verification in Auth
      // However, for consistency in the app, we might want to update it, but Auth is the source of truth.
      // Let's update Firestore ONLY if it's NOT an email change, or if we want to track the "intended" email.
      // The user's request implies they want the change to work.
      if (!emailChanged) {
        updateData.email = profileForm.email;
      }

      if (user.role === 'admin') {
        updateData.displayName = profileForm.displayName;
        updateData.school = profileForm.school;
        updateData.class = profileForm.class;
        if (emailChanged) updateData.email = profileForm.email; // Admins might bypass or we just set it
      }

      await setDoc(doc(db, 'users', user.uid), updateData, { merge: true });

      setIsProfileOpen(false);
      setProfileForm(prev => ({ ...prev, currentPassword: '', newPassword: '' }));
      
      if (emailChanged) {
        toast.success('Một email xác nhận đã được gửi đến địa chỉ mới. Vui lòng kiểm tra hộp thư để hoàn tất thay đổi.');
      } else {
        toast.success('Cập nhật thông tin thành công.');
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      if (error.code === 'auth/wrong-password') {
        toast.error('Mật khẩu hiện tại không chính xác.');
      } else if (error.code === 'auth/requires-recent-login') {
        toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng xuất và đăng nhập lại.');
      } else {
        toast.error(error.message || 'Có lỗi xảy ra khi cập nhật thông tin.');
      }
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
            <h2 className="text-2xl font-sans font-bold text-blue-950 mb-2">Chào mừng, <span translate="no">{user.displayName || user.email.split('@')[0]} </span></h2>
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
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="quizzes" isDropDisabled={user.role !== 'admin' || searchTerm !== '' || selectedSubject !== 'all' || selectedTopic !== 'all'}>
            {(provided) => (
              <div 
                {...provided.droppableProps} 
                ref={provided.innerRef}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {filteredQuizzes.map((quiz, index) => {
                  const attempts = getAttemptCount(quiz.id);
                  const effectiveMax = getEffectiveMaxAttempts(quiz);
                  const limitReached = isAttemptLimitReached(quiz);
                  const roleAllowed = isRoleAllowed(quiz);
                  const isActive = quiz.isActive;
                  const playable = canTakeQuiz(quiz);
                  
                  return (
                    <Draggable 
                      key={quiz.id} 
                      draggableId={quiz.id} 
                      index={index}
                      isDragDisabled={user.role !== 'admin' || searchTerm !== '' || selectedSubject !== 'all' || selectedTopic !== 'all'}
                    >
                      {(provided) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "group bg-white rounded-2xl border border-stone-200 p-6 transition-all flex flex-col relative",
                            !playable 
                              ? "opacity-75 cursor-not-allowed grayscale-[0.5]" 
                              : "hover:shadow-xl hover:shadow-stone-200/50 hover:-translate-y-1 cursor-pointer"
                          )}
                          onClick={() => playable && onTakeQuiz(quiz.id)}
                        >
                          {user.role === 'admin' && searchTerm === '' && selectedSubject === 'all' && selectedTopic === 'all' && (
                            <div 
                              {...provided.dragHandleProps}
                              className="absolute top-2 right-2 p-1 text-stone-300 hover:text-stone-500 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                          )}
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
                              {effectiveMax > 0 ? (
                                <div className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                                  limitReached ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                                )}>
                                  Lượt: {attempts}/{effectiveMax}
                                </div>
                              ) : (
                                <div className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-50 text-stone-400 uppercase tracking-wider">
                                  Lượt: {attempts}/∞
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <h3 className="text-lg font-medium text-stone-900 mb-2 group-hover:text-emerald-700 transition-colors break-normal">{quiz.title}</h3>
                          <p className="text-stone-500 text-sm line-clamp-2 mb-4 flex-grow break-normal">
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
                                <XCircle className="w-4 h-4" /> Không dành cho {user.role === 'student' ? 'Học sinh' : user.role === 'student-vip' ? 'Học sinh-VIP' : 'Khách'}
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
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
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
              <h2 className="text-xl font-sans font-bold text-blue-950">Thông tin cá nhân</h2>
              <button onClick={() => setIsProfileOpen(false)} className="p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateProfile} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <UserCircle className="w-4 h-4" /> Họ và tên
                </label>
                <input
                  type="text"
                  value={profileForm.displayName}
                  onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                  readOnly={user.role !== 'admin'}
                  className={cn(
                    "w-full px-4 py-3 border rounded-xl transition-all",
                    user.role === 'admin' 
                      ? "bg-stone-50 border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" 
                      : "bg-stone-100 border-stone-200 text-stone-500 cursor-not-allowed"
                  )}
                  placeholder="Nhập họ và tên"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                    <School className="w-4 h-4" /> Trường học
                  </label>
                  <input
                    type="text"
                    value={profileForm.school}
                    onChange={(e) => setProfileForm({ ...profileForm, school: e.target.value })}
                    readOnly={user.role !== 'admin'}
                    className={cn(
                      "w-full px-4 py-3 border rounded-xl transition-all",
                      user.role === 'admin' 
                        ? "bg-stone-50 border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" 
                        : "bg-stone-100 border-stone-200 text-stone-500 cursor-not-allowed"
                    )}
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
                    readOnly={user.role !== 'admin'}
                    className={cn(
                      "w-full px-4 py-3 border rounded-xl transition-all",
                      user.role === 'admin' 
                        ? "bg-stone-50 border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" 
                        : "bg-stone-100 border-stone-200 text-stone-500 cursor-not-allowed"
                    )}
                    placeholder="Nhập tên lớp"
                  />
                </div>
              </div>
              
              <div className="h-px bg-stone-100 my-4" />
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Địa chỉ Email
                </label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="Nhập email mới"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Mật khẩu mới
                </label>
                <input
                  type="password"
                  value={profileForm.newPassword}
                  onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="Để trống nếu không muốn đổi"
                />
              </div>

              <div className="h-px bg-stone-100 my-4" />

              <div className="space-y-2 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <label className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <Key className="w-4 h-4" /> Xác nhận mật khẩu hiện tại
                </label>
                <p className="text-[10px] text-amber-700 mb-2">Vui lòng nhập mật khẩu đang sử dụng để lưu các thay đổi.</p>
                <input
                  type="password"
                  required
                  value={profileForm.currentPassword}
                  onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  placeholder="Nhập mật khẩu hiện tại"
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
