import React, { useState, useEffect, useCallback, memo } from 'react';
import ReactQuill from 'react-quill-new';
import * as XLSX from 'xlsx';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, getDocs, writeBatch, deleteField, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Quiz, Question, User, QuestionType } from '../types';
import { Plus, Trash2, Edit, ChevronRight, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Save, X, List, PlusCircle, Upload, Download, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDuration, formatDate, cn } from '../lib/utils';
import ImportQuizModal from '../components/ImportQuizModal';
import { ImportedQuiz, downloadFile } from '../lib/importUtils';
import DOMPurify from 'dompurify';

interface AdminDashboardProps {
  user: User;
}

// Memoized QuestionEditor component for performance
const QuestionEditor = memo(({ 
  q, 
  qIndex, 
  onUpdate, 
  onUpdateOption, 
  onRemove,
  isExpanded,
  onToggleExpand
}: { 
  q: Partial<Question>; 
  qIndex: number; 
  onUpdate: (index: number, field: string, value: any) => void;
  onUpdateOption: (qIndex: number, oIndex: number, value: string) => void;
  onRemove: (index: number) => void;
  isExpanded: boolean;
  onToggleExpand: (index: number) => void;
}) => {
  return (
    <div className={cn(
      "p-6 bg-stone-50 rounded-2xl border transition-all duration-200 relative group",
      isExpanded ? "border-emerald-200 shadow-md ring-1 ring-emerald-100" : "border-stone-200 hover:border-stone-300"
    )}>
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3 cursor-pointer flex-1 min-w-0" onClick={() => onToggleExpand(qIndex)}>
          <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 shrink-0">
            {qIndex + 1}
          </div>
          <div className="flex-1 min-w-0">
            {!isExpanded ? (
              <div 
                className="text-sm text-stone-600 truncate font-medium"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(q.text || 'Câu hỏi chưa có nội dung...') }}
              />
            ) : (
              <span className="text-sm font-bold text-stone-400 uppercase tracking-wider">Đang chỉnh sửa câu hỏi {qIndex + 1}</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleExpand(qIndex)}
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-white rounded-lg transition-all"
            title={isExpanded ? "Thu gọn" : "Mở rộng"}
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          <button
            onClick={() => onRemove(qIndex)}
            className="p-2 text-stone-400 hover:text-red-600 hover:bg-white rounded-lg transition-all"
            title="Xóa câu hỏi"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-6 pt-4 border-t border-stone-200 mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-grow space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase">Loại câu hỏi</label>
              <select
                value={q.type || 'multiple_choice'}
                onChange={(e) => {
                  const type = e.target.value as QuestionType;
                  onUpdate(qIndex, 'type', type);
                  onUpdate(qIndex, 'options', ['', '', '', '']);
                  onUpdate(qIndex, 'correctOptionIndex', type === 'multiple_choice' ? 0 : undefined);
                  onUpdate(qIndex, 'correctAnswers', type === 'true_false' ? [null, null, null, null] : undefined);
                }}
                className="w-full px-4 py-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-500 transition-all"
              >
                <option value="multiple_choice">Nhiều lựa chọn</option>
                <option value="true_false">Đúng / Sai</option>
              </select>
            </div>
            <div className="flex-grow-[2] space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase">Nội dung câu hỏi</label>
              <div className="bg-white rounded-xl overflow-hidden border border-stone-200">
                <ReactQuill
                  theme="snow"
                  value={q.text || ''}
                  onChange={(val) => onUpdate(qIndex, 'text', val)}
                  modules={{
                    toolbar: [
                      [{ 'header': [1, 2, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                      ['link', 'image', 'video'],
                      ['clean']
                    ],
                  }}
                  placeholder="Nhập nội dung câu hỏi (có thể chèn bảng, hình ảnh)..."
                />
              </div>
            </div>
          </div>

          {q.type === 'multiple_choice' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {q.options?.map((opt, oIndex) => (
                <div key={oIndex} className="flex items-center gap-3">
                  <input
                    type="radio"
                    name={`correct-${qIndex}`}
                    checked={q.correctOptionIndex === oIndex}
                    onChange={() => onUpdate(qIndex, 'correctOptionIndex', oIndex)}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <input
                    type="text"
                    value={opt || ''}
                    onChange={(e) => onUpdateOption(qIndex, oIndex, e.target.value)}
                    className="flex-grow px-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder={`Lựa chọn ${oIndex + 1}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-bold text-stone-400 uppercase">Các ý (a, b, c, d) - Chọn Đúng hoặc Sai</p>
              {['a', 'b', 'c', 'd'].map((label, oIndex) => (
                <div key={oIndex} className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 bg-white border border-stone-100 rounded-xl">
                  <div className="flex items-start gap-3 flex-grow">
                    <span className="font-bold text-emerald-600 w-6 mt-2">{label}.</span>
                    <div className="flex-grow bg-stone-50 rounded-lg overflow-hidden border border-stone-200">
                      <ReactQuill
                        theme="snow"
                        value={q.options?.[oIndex] || ''}
                        onChange={(val) => onUpdateOption(qIndex, oIndex, val)}
                        modules={{
                          toolbar: [
                            ['bold', 'italic', 'underline'],
                            ['clean']
                          ],
                        }}
                        placeholder={`Nội dung ý ${label}...`}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-6 bg-stone-100 px-4 py-2 rounded-lg mt-2 sm:mt-0">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="radio"
                        name={`q-${qIndex}-o-${oIndex}`}
                        checked={q.correctAnswers?.[oIndex] === true}
                        onChange={() => {
                          const newCorrect = [...(q.correctAnswers || [null, null, null, null])];
                          newCorrect[oIndex] = true;
                          onUpdate(qIndex, 'correctAnswers', newCorrect);
                        }}
                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-stone-300"
                      />
                      <span className={cn("text-xs font-bold transition-colors", q.correctAnswers?.[oIndex] === true ? "text-emerald-600" : "text-stone-500 group-hover:text-stone-700")}>Đúng</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="radio"
                        name={`q-${qIndex}-o-${oIndex}`}
                        checked={q.correctAnswers?.[oIndex] === false}
                        onChange={() => {
                          const newCorrect = [...(q.correctAnswers || [null, null, null, null])];
                          newCorrect[oIndex] = false;
                          onUpdate(qIndex, 'correctAnswers', newCorrect);
                        }}
                        className="w-4 h-4 text-red-600 focus:ring-red-500 border-stone-300"
                      />
                      <span className={cn("text-xs font-bold transition-colors", q.correctAnswers?.[oIndex] === false ? "text-red-600" : "text-stone-500 group-hover:text-stone-700")}>Sai</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase">Giải thích (không bắt buộc)</label>
            <div className="bg-white rounded-xl overflow-hidden border border-stone-200">
              <ReactQuill
                theme="snow"
                value={q.explanation || ''}
                onChange={(val) => onUpdate(qIndex, 'explanation', val)}
                modules={{
                  toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                  ],
                }}
                placeholder="Giải thích tại sao đáp án này đúng..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuiz, setEditingQuiz] = useState<Partial<Quiz> | null>(null);
  const [editingQuestions, setEditingQuestions] = useState<Partial<Question>[]>([]);
  const [originalQuestionIds, setOriginalQuestionIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterTopic, setFilterTopic] = useState<string>('all');
  const [expandedQuestions, setExpandedQuestions] = useState<Record<number, boolean>>({ 0: true });

  const subjects = ['Toán', 'Vật lý', 'Hóa học', 'Sinh học', 'Tiếng Anh', 'Lịch sử', 'Địa lý', 'GDCD', 'Ngữ văn', 'Tin học'];
  const topics = [
    { id: 'regular', label: 'Kiểm tra thường xuyên' },
    { id: 'periodic', label: 'Kiểm tra định kỳ' },
    { id: 'graduation', label: 'Giải đề TN THPT' }
  ];

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

  const filteredQuizzes = quizzes.filter(quiz => {
    const matchSubject = filterSubject === 'all' || quiz.subject === filterSubject;
    const matchTopic = filterTopic === 'all' || quiz.topic === filterTopic;
    return matchSubject && matchTopic;
  });

  const handleEditQuiz = async (quiz: Quiz) => {
    setEditingQuiz(quiz);
    setSaving(true);
    const questionsSnapshot = await getDocs(query(collection(db, 'quizzes', quiz.id, 'questions'), orderBy('order')));
    const questionList = questionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Question[];
    setEditingQuestions(questionList);
    setOriginalQuestionIds(questionList.map(q => q.id));
    setExpandedQuestions({ 0: true }); // Expand first question by default
    setSaving(false);
    setIsModalOpen(true);
  };

  const handleCreateNew = () => {
    setEditingQuiz({
      title: '',
      description: '',
      subject: 'Toán',
      topic: 'regular',
      duration: 30,
      isActive: true
    });
    setEditingQuestions([{
      type: 'multiple_choice',
      text: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      correctAnswers: [null, null, null, null],
      explanation: '',
      order: 0
    }]);
    setOriginalQuestionIds([]);
    setExpandedQuestions({ 0: true });
    setIsModalOpen(true);
  };

  const handleImportQuiz = (imported: ImportedQuiz) => {
    setEditingQuiz({
      title: imported.title,
      description: imported.description,
      subject: imported.subject,
      topic: imported.topic,
      duration: imported.duration,
      isActive: true
    });
    setEditingQuestions(imported.questions.map((q, index) => {
      const { id, ...rest } = q as any;
      return {
        ...rest,
        type: q.type || 'multiple_choice',
        options: q.options || ['', '', '', ''],
        correctOptionIndex: q.correctOptionIndex ?? 0,
        correctAnswers: q.correctAnswers || [null, null, null, null],
        explanation: q.explanation || '',
        order: q.order ?? index
      };
    }));
    setOriginalQuestionIds([]);
    setExpandedQuestions({ 0: true });
    setIsModalOpen(true);
  };

  const handleExportQuiz = async (quiz: Quiz) => {
    try {
      const questionsSnapshot = await getDocs(query(collection(db, 'quizzes', quiz.id, 'questions'), orderBy('order')));
      const questions = questionsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          type: data.type,
          text: data.text,
          options: data.options,
          correctOptionIndex: data.correctOptionIndex,
          correctAnswers: data.correctAnswers,
          explanation: data.explanation,
          order: data.order
        };
      });

      const exportData = {
        title: quiz.title,
        description: quiz.description,
        subject: quiz.subject,
        topic: quiz.topic,
        duration: quiz.duration,
        questions
      };

      downloadFile(JSON.stringify(exportData, null, 2), `${quiz.title.replace(/\s+/g, '_')}.json`, 'application/json');
    } catch (error) {
      console.error('Error exporting quiz:', error);
      alert('Có lỗi xảy ra khi xuất bài thi.');
    }
  };

  const handleExportResults = async (quiz: Quiz) => {
    try {
      setSaving(true);
      const resultsSnapshot = await getDocs(query(collection(db, 'results'), where('quizId', '==', quiz.id), orderBy('completedAt', 'desc')));
      const results = resultsSnapshot.docs.map(doc => doc.data());

      if (results.length === 0) {
        alert('Chưa có kết quả nào cho bài thi này.');
        return;
      }

      // Fetch user details for school and class
      const userUids = Array.from(new Set(results.map(r => r.studentUid)));
      const usersData: Record<string, any> = {};
      
      // Batch fetch users (Firestore doesn't support 'in' with more than 30, but let's assume it's fine for now or do it in chunks)
      for (let i = 0; i < userUids.length; i += 30) {
        const chunk = userUids.slice(i, i + 30);
        const usersSnapshot = await getDocs(query(collection(db, 'users'), where('uid', 'in', chunk)));
        usersSnapshot.docs.forEach(doc => {
          usersData[doc.id] = doc.data();
        });
      }

      const exportData = results.map((r: any) => ({
        'Họ và tên': r.studentName,
        'Email': usersData[r.studentUid]?.email || '',
        'Trường': usersData[r.studentUid]?.school || '',
        'Lớp': usersData[r.studentUid]?.class || '',
        'Điểm số': r.score.toFixed(2),
        'Số câu đúng': `${r.correctAnswers}/${r.totalQuestions}`,
        'Thời gian hoàn thành': r.completedAt?.toDate().toLocaleString('vi-VN') || ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Kết quả");
      XLSX.writeFile(wb, `Ket_qua_${quiz.title.replace(/\s+/g, '_')}.xlsx`);
    } catch (error) {
      console.error('Error exporting results:', error);
      alert('Có lỗi xảy ra khi xuất kết quả.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editingQuiz?.title || !editingQuiz?.duration) {
      alert('Vui lòng nhập tiêu đề và thời gian làm bài.');
      return;
    }

    // Validate questions
    const validQuestions = editingQuestions.filter(q => {
      if (!q.text) return false;
      if (q.type === 'multiple_choice') {
        return q.options && q.options.length >= 2 && q.options.every(opt => opt && opt.trim() !== '');
      } else if (q.type === 'true_false') {
        // For True/False, we always have 4 options in the UI.
        // We require all 4 options to be filled and all 4 answers to be selected.
        const allOptionsFilled = q.options && q.options.length === 4 && q.options.every(opt => opt && opt.trim() !== '' && opt !== '<p><br></p>');
        const allAnswersSelected = q.correctAnswers && q.correctAnswers.length === 4 && q.correctAnswers.every(ans => ans !== null);
        return allOptionsFilled && allAnswersSelected;
      }
      return false;
    });
    
    if (validQuestions.length === 0) {
      alert('Vui lòng thêm ít nhất một câu hỏi hoàn chỉnh (có nội dung và đầy đủ các lựa chọn).');
      return;
    }

    setSaving(true);
    try {
      let quizId = editingQuiz.id;
      const quizData = {
        title: editingQuiz.title,
        description: editingQuiz.description || '',
        subject: editingQuiz.subject || 'Toán',
        topic: editingQuiz.topic || 'regular',
        duration: Number(editingQuiz.duration),
        maxAttempts: Number(editingQuiz.maxAttempts || 0),
        isActive: editingQuiz.isActive ?? true,
        allowedRoles: editingQuiz.allowedRoles || ['student', 'guest'],
        updatedAt: serverTimestamp()
      };

      if (quizId) {
        try {
          await updateDoc(doc(db, 'quizzes', quizId), quizData);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `quizzes/${quizId}`);
        }
      } else {
        try {
          const docRef = await addDoc(collection(db, 'quizzes'), {
            ...quizData,
            createdBy: user.uid,
            createdAt: serverTimestamp()
          });
          quizId = docRef.id;
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'quizzes');
        }
      }

      if (!quizId) throw new Error('Không thể xác định ID bài thi.');

      // Save questions using a batch for better performance and atomicity
      const batch = writeBatch(db);
      const questionsCol = collection(db, 'quizzes', quizId, 'questions');
      
      // Track which IDs are being kept/updated
      const keptQuestionIds = new Set<string>();

      for (let i = 0; i < validQuestions.length; i++) {
        const q = validQuestions[i];
        const qData: any = {
          type: q.type || 'multiple_choice',
          text: q.text,
          explanation: q.explanation || '',
          order: i, // Use the current index in validQuestions to preserve order
          updatedAt: serverTimestamp()
        };

        if (q.id) {
          if (q.type === 'multiple_choice') {
            // Ensure options is a list of strings, size 2-10
            let opts = q.options;
            if (!Array.isArray(opts)) opts = ['', ''];
            qData.options = opts.slice(0, 10).map(v => String(v || ''));
            if (qData.options.length < 2) qData.options.push('', '');
            
            qData.correctOptionIndex = Number(q.correctOptionIndex ?? 0);
            if (isNaN(qData.correctOptionIndex) || qData.correctOptionIndex < 0 || qData.correctOptionIndex >= qData.options.length) {
              qData.correctOptionIndex = 0;
            }
          } else {
            // Ensure correctAnswers is exactly 4 booleans
            let ca = q.correctAnswers;
            if (!Array.isArray(ca)) ca = [true, true, true, true];
            qData.correctAnswers = ca.slice(0, 4).map(v => v === null ? true : !!v);
            while (qData.correctAnswers.length < 4) qData.correctAnswers.push(true);
            
            // Ensure options is exactly 4 strings
            let opts = q.options;
            if (!Array.isArray(opts)) opts = ['', '', '', ''];
            qData.options = opts.slice(0, 4).map(v => String(v || ''));
            while (qData.options.length < 4) qData.options.push('');
          }
          batch.set(doc(questionsCol, q.id), qData);
          keptQuestionIds.add(q.id);
        } else {
          if (q.type === 'multiple_choice') {
            // Ensure options is a list of strings, size 2-10
            let opts = q.options;
            if (!Array.isArray(opts)) opts = ['', ''];
            qData.options = opts.slice(0, 10).map(v => String(v || ''));
            if (qData.options.length < 2) qData.options.push('', '');

            qData.correctOptionIndex = Number(q.correctOptionIndex ?? 0);
            if (isNaN(qData.correctOptionIndex) || qData.correctOptionIndex < 0 || qData.correctOptionIndex >= qData.options.length) {
              qData.correctOptionIndex = 0;
            }
          } else {
            // Ensure correctAnswers is exactly 4 booleans
            let ca = q.correctAnswers;
            if (!Array.isArray(ca)) ca = [true, true, true, true];
            qData.correctAnswers = ca.slice(0, 4).map(v => v === null ? true : !!v);
            while (qData.correctAnswers.length < 4) qData.correctAnswers.push(true);
            
            // Ensure options is exactly 4 strings
            let opts = q.options;
            if (!Array.isArray(opts)) opts = ['', '', '', ''];
            qData.options = opts.slice(0, 4).map(v => String(v || ''));
            while (qData.options.length < 4) qData.options.push('');
          }
          const newDocRef = doc(questionsCol);
          batch.set(newDocRef, qData);
        }
      }

      // Delete questions that were removed
      const deletedIds = originalQuestionIds.filter(id => !keptQuestionIds.has(id));
      for (const id of deletedIds) {
        batch.delete(doc(questionsCol, id));
      }

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `quizzes/${quizId}/questions (batch)`);
      }

      setIsModalOpen(false);
      setEditingQuiz(null);
      setEditingQuestions([]);
      setOriginalQuestionIds([]);
      alert('Lưu bài thi thành công!');
    } catch (error: any) {
      console.error('Error saving quiz:', error);
      let errorMessage = 'Có lỗi xảy ra khi lưu bài thi.';
      try {
        const parsedError = JSON.parse(error.message);
        if (parsedError.error.includes('permission-denied')) {
          errorMessage = 'Bạn không có quyền thực hiện thao tác này. Vui lòng kiểm tra lại vai trò của mình.';
        } else {
          errorMessage = `Lỗi: ${parsedError.error}`;
        }
      } catch (e) {
        errorMessage = `Lỗi: ${error.message || 'Không xác định'}`;
      }
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa bài thi này?')) {
      await deleteDoc(doc(db, 'quizzes', id));
    }
  };

  const addQuestion = useCallback(() => {
    setEditingQuestions(prev => [...prev, {
      type: 'multiple_choice',
      text: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      correctAnswers: [null, null, null, null],
      explanation: '',
      order: prev.length
    }]);
    setExpandedQuestions(prev => ({ ...prev, [editingQuestions.length]: true }));
  }, [editingQuestions.length]);

  const removeQuestion = useCallback((index: number) => {
    setEditingQuestions(prev => prev.filter((_, i) => i !== index));
    setExpandedQuestions(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  const updateQuestion = useCallback((index: number, field: string, value: any) => {
    setEditingQuestions(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const updateOption = useCallback((qIndex: number, oIndex: number, value: string) => {
    setEditingQuestions(prev => {
      const next = [...prev];
      const nextOptions = [...(next[qIndex].options || [])];
      nextOptions[oIndex] = value;
      next[qIndex] = { ...next[qIndex], options: nextOptions };
      return next;
    });
  }, []);

  const toggleExpand = useCallback((index: number) => {
    setExpandedQuestions(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-serif font-medium text-stone-900 mb-2 italic">Quản lý bài thi</h1>
          <p className="text-stone-500">Tạo mới và quản lý các bộ đề thi trắc nghiệm.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-stone-100 text-stone-600 py-3 px-6 rounded-xl hover:bg-stone-200 transition-all font-medium border border-stone-200"
          >
            <Upload className="w-5 h-5" />
            Nhập đề thi (Word/JSON)
          </button>
          <button
            onClick={handleCreateNew}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-xl hover:bg-emerald-700 transition-all font-medium shadow-lg shadow-emerald-200"
          >
            <Plus className="w-5 h-5" />
            Tạo bài thi mới
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Lọc theo Môn học</label>
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="w-full sm:w-48 px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-500 transition-all text-sm"
          >
            <option value="all">Tất cả môn học</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Lọc theo Chủ đề</label>
          <select
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            className="w-full sm:w-48 px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-500 transition-all text-sm"
          >
            <option value="all">Tất cả chủ đề</option>
            {topics.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        {(filterSubject !== 'all' || filterTopic !== 'all') && (
          <button
            onClick={() => {
              setFilterSubject('all');
              setFilterTopic('all');
            }}
            className="text-sm text-stone-400 hover:text-stone-600 px-2 py-2 transition-colors"
          >
            Xóa lọc
          </button>
        )}
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
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Môn học</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Chủ đề</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Thời gian</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Trạng thái</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredQuizzes.length > 0 ? filteredQuizzes.map((quiz) => (
                <tr key={quiz.id} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-stone-900">{quiz.title}</div>
                    <div className="text-xs text-stone-400 line-clamp-1">{quiz.description}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {quiz.subject}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs px-2 py-1 bg-stone-100 rounded text-stone-600">
                      {topics.find(t => t.id === quiz.topic)?.label || quiz.topic}
                    </span>
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
                        onClick={() => handleExportResults(quiz)}
                        title="Xuất kết quả thi (Excel)"
                        className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleExportQuiz(quiz)}
                        title="Xuất đề thi (JSON)"
                        className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
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
              )) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-stone-400 italic">
                    Không tìm thấy bài thi nào phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isImportModalOpen && (
        <ImportQuizModal 
          onClose={() => setIsImportModalOpen(false)} 
          onImport={handleImportQuiz} 
        />
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
                    <label className="text-sm font-medium text-stone-700">Môn học</label>
                    <select
                      value={editingQuiz?.subject || 'Toán'}
                      onChange={(e) => setEditingQuiz({ ...editingQuiz, subject: e.target.value })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    >
                      {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">Chủ đề</label>
                    <select
                      value={editingQuiz?.topic || 'regular'}
                      onChange={(e) => setEditingQuiz({ ...editingQuiz, topic: e.target.value as any })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    >
                      {topics.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
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
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">Số lượt thi tối đa (0 = không giới hạn)</label>
                    <input
                      type="number"
                      value={editingQuiz?.maxAttempts || 0}
                      onChange={(e) => setEditingQuiz({ ...editingQuiz, maxAttempts: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="VD: 1"
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

                <div className="space-y-4">
                  <label className="text-sm font-medium text-stone-700 block">Vai trò được phép tham gia thi</label>
                  <div className="flex flex-wrap gap-6">
                    {['student', 'guest'].map((role) => (
                      <div key={role} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`role-${role}`}
                          checked={editingQuiz?.allowedRoles?.includes(role as any) ?? true}
                          onChange={(e) => {
                            const currentRoles = editingQuiz?.allowedRoles || ['student', 'guest'];
                            const newRoles = e.target.checked 
                              ? [...currentRoles, role as any]
                              : currentRoles.filter(r => r !== role);
                            setEditingQuiz({ ...editingQuiz, allowedRoles: newRoles });
                          }}
                          className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <label htmlFor={`role-${role}`} className="text-sm text-stone-600 capitalize">
                          {role === 'student' ? 'Học sinh' : 'Khách'}
                        </label>
                      </div>
                    ))}
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

                <div className="space-y-4">
                  {editingQuestions.map((q, qIndex) => (
                    <QuestionEditor
                      key={qIndex}
                      q={q}
                      qIndex={qIndex}
                      onUpdate={updateQuestion}
                      onUpdateOption={updateOption}
                      onRemove={removeQuestion}
                      isExpanded={!!expandedQuestions[qIndex]}
                      onToggleExpand={toggleExpand}
                    />
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
