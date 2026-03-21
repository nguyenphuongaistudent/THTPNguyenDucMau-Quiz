import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Quiz, Question, User } from '../types';
import { Plus, Trash2, Edit, ChevronRight, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Save, X, List, PlusCircle } from 'lucide-react';
import { formatDuration, formatDate, cn } from '../lib/utils';

interface AdminDashboardProps {
  user: User;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuiz, setEditingQuiz] = useState<Partial<Quiz> | null>(null);
  const [editingQuestions, setEditingQuestions] = useState<Partial<Question>[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'quizzes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const quizList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Quiz[];
      setQuizzes(quizList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleEditQuiz = async (quiz: Quiz) => {
    setEditingQuiz(quiz);
    setSaving(true);
    const questionsSnapshot = await getDocs(collection(db, 'quizzes', quiz.id, 'questions'));
    const questionList = questionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Question[];
    setEditingQuestions(questionList);
    setSaving(false);
    setIsModalOpen(true);
  };

  const handleCreateNew = () => {
    setEditingQuiz({
      title: '',
      description: '',
      duration: 30,
      isActive: true
    });
    setEditingQuestions([{
      text: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      explanation: ''
    }]);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingQuiz?.title || !editingQuiz?.duration) {
      alert('Vui lòng nhập tiêu đề và thời gian làm bài.');
      return;
    }

    setSaving(true);
    try {
      let quizId = editingQuiz.id;
      const quizData = {
        title: editingQuiz.title,
        description: editingQuiz.description || '',
        duration: Number(editingQuiz.duration),
        isActive: editingQuiz.isActive ?? true,
        updatedAt: serverTimestamp()
      };

      if (quizId) {
        await updateDoc(doc(db, 'quizzes', quizId), quizData);
      } else {
        const docRef = await addDoc(collection(db, 'quizzes'), {
          ...quizData,
          createdBy: user.uid,
          createdAt: serverTimestamp()
        });
        quizId = docRef.id;
      }

      // Save questions
      // For simplicity, we delete old questions and add new ones if it's a new quiz
      // Or update existing ones. In a real app, you'd handle this more carefully.
      const questionsCol = collection(db, 'quizzes', quizId, 'questions');
      
      // If editing, we might want to clear old questions or update them.
      // Let's just add/update what's in the list.
      for (const q of editingQuestions) {
        if (!q.text || q.options?.some(opt => !opt)) continue;
        
        const qData = {
          text: q.text,
          options: q.options,
          correctOptionIndex: q.correctOptionIndex,
          explanation: q.explanation || ''
        };

        if (q.id) {
          await updateDoc(doc(questionsCol, q.id), qData);
        } else {
          await addDoc(questionsCol, qData);
        }
      }

      setIsModalOpen(false);
      setEditingQuiz(null);
      setEditingQuestions([]);
    } catch (error) {
      console.error('Error saving quiz:', error);
      alert('Có lỗi xảy ra khi lưu bài thi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa bài thi này?')) {
      await deleteDoc(doc(db, 'quizzes', id));
    }
  };

  const addQuestion = () => {
    setEditingQuestions([...editingQuestions, {
      text: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      explanation: ''
    }]);
  };

  const removeQuestion = (index: number) => {
    setEditingQuestions(editingQuestions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    const newQuestions = [...editingQuestions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    setEditingQuestions(newQuestions);
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const newQuestions = [...editingQuestions];
    const newOptions = [...(newQuestions[qIndex].options || [])];
    newOptions[oIndex] = value;
    newQuestions[qIndex] = { ...newQuestions[qIndex], options: newOptions };
    setEditingQuestions(newQuestions);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-serif font-medium text-stone-900 mb-2 italic">Quản lý bài thi</h1>
          <p className="text-stone-500">Tạo mới và quản lý các bộ đề thi trắc nghiệm.</p>
        </div>
        
        <button
          onClick={handleCreateNew}
          className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-xl hover:bg-emerald-700 transition-all font-medium shadow-lg shadow-emerald-200"
        >
          <Plus className="w-5 h-5" />
          Tạo bài thi mới
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-stone-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Bài thi</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Thời gian</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Trạng thái</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Ngày tạo</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {quizzes.map((quiz) => (
                <tr key={quiz.id} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-stone-900">{quiz.title}</div>
                    <div className="text-xs text-stone-400 line-clamp-1">{quiz.description}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {formatDuration(quiz.duration)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium",
                      quiz.isActive ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-600"
                    )}>
                      {quiz.isActive ? "Đang mở" : "Đã đóng"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-500">
                    {formatDate(quiz.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleEditQuiz(quiz)}
                        className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteQuiz(quiz.id)}
                        className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Editor */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)} />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <h2 className="text-2xl font-serif italic font-medium">
                {editingQuiz?.id ? 'Chỉnh sửa bài thi' : 'Tạo bài thi mới'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                className="p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-8 space-y-10">
              {/* Quiz Info */}
              <section className="space-y-6">
                <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <List className="w-4 h-4" /> Thông tin chung
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">Tiêu đề bài thi</label>
                    <input
                      type="text"
                      value={editingQuiz?.title || ''}
                      onChange={(e) => setEditingQuiz({ ...editingQuiz, title: e.target.value })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="VD: Kiểm tra Toán 10 - Chương 1"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">Thời gian làm bài (phút)</label>
                    <input
                      type="number"
                      value={editingQuiz?.duration || ''}
                      onChange={(e) => setEditingQuiz({ ...editingQuiz, duration: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="VD: 45"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-sm font-medium text-stone-700">Mô tả bài thi</label>
                    <textarea
                      value={editingQuiz?.description || ''}
                      onChange={(e) => setEditingQuiz({ ...editingQuiz, description: e.target.value })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all min-h-[100px]"
                      placeholder="Nhập mô tả ngắn gọn về bài thi..."
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={editingQuiz?.isActive ?? true}
                      onChange={(e) => setEditingQuiz({ ...editingQuiz, isActive: e.target.checked })}
                      className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="isActive" className="text-sm font-medium text-stone-700">Công khai bài thi</label>
                  </div>
                </div>
              </section>

              {/* Questions */}
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" /> Danh sách câu hỏi ({editingQuestions.length})
                  </h3>
                  <button
                    onClick={addQuestion}
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Thêm câu hỏi
                  </button>
                </div>

                <div className="space-y-8">
                  {editingQuestions.map((q, qIndex) => (
                    <div key={qIndex} className="p-6 bg-stone-50 rounded-2xl border border-stone-200 relative group">
                      <button
                        onClick={() => removeQuestion(qIndex)}
                        className="absolute -top-2 -right-2 w-8 h-8 bg-white border border-stone-200 text-stone-400 hover:text-red-600 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-stone-400 uppercase">Câu hỏi {qIndex + 1}</label>
                          <input
                            type="text"
                            value={q.text || ''}
                            onChange={(e) => updateQuestion(qIndex, 'text', e.target.value)}
                            className="w-full px-4 py-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-500 transition-all"
                            placeholder="Nhập nội dung câu hỏi..."
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {q.options?.map((opt, oIndex) => (
                            <div key={oIndex} className="flex items-center gap-3">
                              <input
                                type="radio"
                                name={`correct-${qIndex}`}
                                checked={q.correctOptionIndex === oIndex}
                                onChange={() => updateQuestion(qIndex, 'correctOptionIndex', oIndex)}
                                className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                              />
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                                className={cn(
                                  "flex-grow px-4 py-2 bg-white border rounded-lg focus:outline-none transition-all",
                                  q.correctOptionIndex === oIndex ? "border-emerald-500 ring-1 ring-emerald-500/20" : "border-stone-200"
                                )}
                                placeholder={`Lựa chọn ${oIndex + 1}`}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-stone-400 uppercase">Giải thích (không bắt buộc)</label>
                          <textarea
                            value={q.explanation || ''}
                            onChange={(e) => updateQuestion(qIndex, 'explanation', e.target.value)}
                            className="w-full px-4 py-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-500 transition-all min-h-[60px]"
                            placeholder="Giải thích tại sao đáp án này đúng..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="px-8 py-6 border-t border-stone-100 flex items-center justify-end gap-4 bg-stone-50/50">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                className="px-6 py-2.5 text-stone-500 font-medium hover:text-stone-900 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-stone-900 text-white py-2.5 px-8 rounded-xl hover:bg-stone-800 transition-all font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Lưu bài thi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
