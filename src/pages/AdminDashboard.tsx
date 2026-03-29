import React, { useState, useEffect, useCallback, memo } from 'react';
import ReactQuill from 'react-quill-new';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, getDocs, writeBatch, deleteField, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Quiz, Question, User, QuestionType, Result, SpecialAttemptLimit } from '../types';
import { Plus, Trash2, Edit, ChevronRight, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Save, X, List, PlusCircle, Upload, Download, FileSpreadsheet, ChevronDown, ChevronUp, BarChart3, UserPlus, Users, GripVertical, Eye, EyeOff, Shield } from 'lucide-react';
import { formatDuration, formatDate, cn } from '../lib/utils';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import ImportQuizModal from '../components/ImportQuizModal';
import RichText from '../components/RichText';
import { ImportedQuiz, downloadFile } from '../lib/importUtils';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import ConfirmModal from '../components/ConfirmModal';

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
  onToggleExpand,
  dragHandleProps
}: { 
  q: Partial<Question>; 
  qIndex: number; 
  onUpdate: (index: number, field: string, value: any) => void;
  onUpdateOption: (qIndex: number, oIndex: number, value: string) => void;
  onRemove: (index: number) => void;
  isExpanded: boolean;
  onToggleExpand: (index: number) => void;
  dragHandleProps?: any;
}) => {
  return (
    <div className={cn(
      "p-6 bg-stone-50 rounded-2xl border transition-all duration-200 relative group",
      isExpanded ? "border-emerald-200 shadow-md ring-1 ring-emerald-100" : "border-stone-200 hover:border-stone-300",
      q.hidden && "opacity-60 grayscale-[0.5]"
    )}>
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div 
            {...dragHandleProps}
            className="p-1 text-stone-400 hover:text-stone-600 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-3 cursor-pointer flex-1 min-w-0" onClick={() => onToggleExpand(qIndex)}>
            <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 shrink-0">
              {qIndex + 1}
            </div>
            <div className="flex-1 min-w-0">
              {!isExpanded ? (
                <div className="flex items-start gap-2">
                  <RichText 
                    className="text-xs text-stone-600 line-clamp-2 font-medium max-h-12 overflow-hidden break-normal flex-1"
                    content={q.text || 'Câu hỏi chưa có nội dung...'}
                  />
                  {q.hidden && <span className="text-[10px] font-bold uppercase bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded mt-1">Đã ẩn</span>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-stone-400 uppercase tracking-wider">Đang chỉnh sửa câu hỏi {qIndex + 1}</span>
                  {q.hidden && <span className="text-[10px] font-bold uppercase bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded">Đã ẩn</span>}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onUpdate(qIndex, 'hidden', !q.hidden)}
            className={cn(
              "p-2 rounded-lg transition-all",
              q.hidden ? "text-amber-600 bg-amber-50 hover:bg-amber-100" : "text-stone-400 hover:text-stone-600 hover:bg-white"
            )}
            title={q.hidden ? "Hiện câu hỏi" : "Ẩn câu hỏi"}
          >
            {q.hidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
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
                  <div className="flex-grow min-w-0 bg-white rounded-xl overflow-hidden border border-stone-200">
                    <ReactQuill
                      theme="snow"
                      value={opt || ''}
                      onChange={(val) => onUpdateOption(qIndex, oIndex, val)}
                      modules={{
                        toolbar: [
                          ['bold', 'italic', 'underline'],
                          ['image', 'clean']
                        ],
                      }}
                      placeholder={`Lựa chọn ${oIndex + 1}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-bold text-stone-400 uppercase">Các ý (A, B, C, D) - Chọn Đúng hoặc Sai</p>
              {['A', 'B', 'C', 'D'].map((label, oIndex) => (
                <div key={oIndex} className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 bg-white border border-stone-100 rounded-xl">
                  <div className="flex items-start gap-3 flex-grow min-w-0">
                    <span className="font-bold text-emerald-600 w-6 mt-2">{label}.</span>
                    <div className="flex-grow min-w-0 bg-stone-50 rounded-lg overflow-hidden border border-stone-200">
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

const QuizStatsModal = ({ quiz, onClose }: { quiz: Quiz; onClose: () => void }) => {
  const [stats, setStats] = useState<{ questionId: string; text: string; wrongCount: number; totalCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const resultsQ = query(collection(db, 'results'), where('quizId', '==', quiz.id));
        const resultsSnapshot = await getDocs(resultsQ);
        const results = resultsSnapshot.docs.map(doc => doc.data() as Result);

        const questionsSnapshot = await getDocs(collection(db, 'quizzes', quiz.id, 'questions'));
        const questions = questionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const questionStats: Record<string, { wrong: number; total: number }> = {};
        
        results.forEach(result => {
          if (result.answers && Array.isArray(result.answers)) {
            result.answers.forEach(ans => {
              if (ans.questionId) {
                if (!questionStats[ans.questionId]) {
                  questionStats[ans.questionId] = { wrong: 0, total: 0 };
                }
                questionStats[ans.questionId].total++;
                if (!ans.isCorrect) {
                  questionStats[ans.questionId].wrong++;
                }
              }
            });
          }
        });

        const sortedStats = questions
          .filter(q => q !== undefined && q !== null)
          .map(q => ({
            questionId: q.id,
            text: q.text,
            wrongCount: questionStats[q.id]?.wrong || 0,
            totalCount: questionStats[q.id]?.total || 0
          })).sort((a, b) => b.wrongCount - a.wrongCount);

        setStats(sortedStats);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [quiz.id]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-4xl max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <h2 className="text-xl font-sans font-bold text-blue-950">Thống kê câu hỏi hay sai: {quiz.title}</h2>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-grow overflow-y-auto p-8">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-stone-300" /></div>
          ) : stats.length > 0 ? (
            <div className="space-y-4">
              {stats.map((s, i) => (
                <div key={s.questionId} className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <RichText className="text-sm text-stone-800 mb-2 break-normal w-full font-arial" content={s.text} />
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">
                        <XCircle className="w-3 h-3" /> Sai: {s.wrongCount}
                      </div>
                      <div className="flex items-center gap-1 text-xs font-medium text-stone-500 bg-stone-100 px-2 py-1 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Tổng lượt: {s.totalCount}
                      </div>
                      <div className="text-xs font-bold text-stone-400">
                        Tỷ lệ sai: {s.totalCount > 0 ? Math.round((s.wrongCount / s.totalCount) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-20 text-stone-400 italic">Chưa có dữ liệu thống kê cho bài thi này.</p>
          )}
        </div>
      </div>
    </div>
  );
};

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
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; isOpen: boolean }>({ id: '', isOpen: false });
  const [statsQuiz, setStatsQuiz] = useState<Quiz | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);

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
      
      // Sort by order, then by createdAt
      const sortedQuizzes = quizList.sort((a, b) => {
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
      console.error("Error listening to quizzes:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as User[];
      setAllUsers(userList);
      
      const classes = Array.from(new Set(userList.map(u => u.class).filter(Boolean))) as string[];
      setAvailableClasses(classes.sort());
    }, (error) => {
      console.error("Error listening to users:", error);
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
    const questionsSnapshot = await getDocs(collection(db, 'quizzes', quiz.id, 'questions'));
    const questionList = questionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Question[];
    
    // Sort in memory
    questionList.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    setEditingQuestions(questionList);
    setOriginalQuestionIds(questionList.map(q => q.id));
    setExpandedQuestions({ 0: true }); // Expand first question by default
    setSaving(false);
    setIsModalOpen(true);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(editingQuestions);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order field for all items
    const updatedItems = items.map((item, index) => ({
      ...item,
      order: index
    }));

    setEditingQuestions(updatedItems);
  };

  const handleCreateNew = () => {
    setEditingQuiz({
      title: '',
      description: '',
      subject: 'Toán',
      topic: 'regular',
      duration: 30,
      isActive: true,
      securitySettings: {
        preventTabSwitch: false,
        maxViolations: 0,
        autoSubmitOnMaxViolations: false,
        showWarningOnViolation: true,
        shuffleQuestions: true,
        shuffleOptions: true
      }
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
      maxAttempts: imported.maxAttempts ?? 1,
      specialAttemptLimits: imported.specialAttemptLimits || [],
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
      const questionsSnapshot = await getDocs(collection(db, 'quizzes', quiz.id, 'questions'));
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
      }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const exportData = {
        title: quiz.title,
        description: quiz.description,
        subject: quiz.subject,
        topic: quiz.topic,
        duration: quiz.duration,
        maxAttempts: quiz.maxAttempts,
        specialAttemptLimits: quiz.specialAttemptLimits || [],
        questions
      };

      downloadFile(JSON.stringify(exportData, null, 2), `${quiz.title.replace(/\s+/g, '_')}.json`, 'application/json');
    } catch (error) {
      console.error('Error exporting quiz:', error);
      toast.error('Có lỗi xảy ra khi xuất bài thi.');
    }
  };

  const handleExportResults = async (quiz: Quiz) => {
    try {
      setSaving(true);
      const resultsSnapshot = await getDocs(query(collection(db, 'results'), where('quizId', '==', quiz.id), orderBy('completedAt', 'desc')));
      const results = resultsSnapshot.docs.map(doc => doc.data());

      if (results.length === 0) {
        toast.error('Chưa có kết quả nào cho bài thi này.');
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
        'Số lần vi phạm': r.violationCount || 0,
        'Thời gian hoàn thành': r.completedAt?.toDate().toLocaleString('vi-VN') || ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Kết quả");
      XLSX.writeFile(wb, `Ket_qua_${quiz.title.replace(/\s+/g, '_')}.xlsx`);
    } catch (error) {
      console.error('Error exporting results:', error);
      toast.error('Có lỗi xảy ra khi xuất kết quả.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editingQuiz?.title || !editingQuiz?.duration) {
      toast.error('Vui lòng nhập tiêu đề và thời gian làm bài.');
      return;
    }

    // Validate questions
    const validQuestions = editingQuestions.filter(q => {
      if (!q || !q.text) return false;
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
      toast.error('Vui lòng thêm ít nhất một câu hỏi hoàn chỉnh (có nội dung và đầy đủ các lựa chọn).');
      return;
    }

    // Check for duplicate title (if it's a new quiz or title changed)
    const isNewQuiz = !editingQuiz.id;
    const titleChanged = !isNewQuiz && editingQuiz.title !== quizzes.find(q => q.id === editingQuiz.id)?.title;

    if (isNewQuiz || titleChanged) {
      const duplicate = quizzes.find(q => q.title.trim().toLowerCase() === editingQuiz.title.trim().toLowerCase() && q.id !== editingQuiz.id);
      if (duplicate) {
        toast.error('Tên bài thi đã tồn tại. Vui lòng chọn tên khác.');
        return;
      }
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
        allowedRoles: editingQuiz.allowedRoles || ['student', 'student-vip', 'guest'],
        reviewRoles: editingQuiz.reviewRoles || ['student', 'student-vip', 'guest'],
        specialAttemptLimits: editingQuiz.specialAttemptLimits || [],
        order: editingQuiz.order ?? 0,
        securitySettings: {
          preventTabSwitch: editingQuiz.securitySettings?.preventTabSwitch || false,
          maxViolations: Number(editingQuiz.securitySettings?.maxViolations || 0),
          autoSubmitOnMaxViolations: editingQuiz.securitySettings?.autoSubmitOnMaxViolations || false,
          showWarningOnViolation: editingQuiz.securitySettings?.showWarningOnViolation ?? true,
          shuffleQuestions: editingQuiz.securitySettings?.shuffleQuestions ?? true,
          shuffleOptions: editingQuiz.securitySettings?.shuffleOptions ?? true
        },
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
          hidden: q.hidden || false,
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
      toast.success('Lưu bài thi thành công!');
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
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadSample = async () => {
    try {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: "Tiêu đề: Đề thi mẫu THPT",
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              text: "Môn: Toán",
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              text: "Thời gian: 90",
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              text: "Chủ đề: regular",
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [
                new TextRun({ text: "Phần I. Câu hỏi nhiều lựa chọn", bold: true }),
              ],
            }),
            new Paragraph({
              text: "Câu 1. Nội dung câu hỏi trắc nghiệm...",
            }),
            new Paragraph({ text: "A. Phương án A" }),
            new Paragraph({ text: "B. Phương án B" }),
            new Paragraph({ text: "C. Phương án C" }),
            new Paragraph({ text: "D. Phương án D" }),
            new Paragraph({
              children: [
                new TextRun({ text: "Đáp án: ", bold: true }),
                new TextRun("A"),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Giải thích: ", bold: true, italics: true }),
                new TextRun("Đây là phần giải thích cho câu hỏi trắc nghiệm."),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [
                new TextRun({ text: "Phần II. Câu hỏi đúng sai", bold: true }),
              ],
            }),
            new Paragraph({
              text: "Câu 1. Nội dung câu hỏi đúng sai...",
            }),
            new Paragraph({ text: "a. Ý thứ nhất" }),
            new Paragraph({ text: "b. Ý thứ hai" }),
            new Paragraph({ text: "c. Ý thứ ba" }),
            new Paragraph({ text: "d. Ý thứ tư" }),
            new Paragraph({
              children: [
                new TextRun({ text: "Đáp án: ", bold: true }),
                new TextRun("Đúng, Sai, Đúng, Đúng"),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Giải thích: ", bold: true, italics: true }),
                new TextRun("Đây là phần giải thích cho câu hỏi đúng sai."),
              ],
            }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, 'Mau_de_thi.docx');
      toast.success('Đã tải xuống file mẫu định dạng Word (.docx). Bạn có thể soạn thảo tương tự trong file này để nhập vào hệ thống.');
    } catch (error) {
      console.error('Error generating Word sample:', error);
      toast.error('Có lỗi xảy ra khi tạo file mẫu.');
    }
  };

  const handleToggleQuizStatus = async (quiz: Quiz) => {
    try {
      await updateDoc(doc(db, 'quizzes', quiz.id), {
        isActive: !quiz.isActive,
        updatedAt: serverTimestamp()
      });
      toast.success(`Đã ${!quiz.isActive ? 'mở' : 'đóng'} bài thi thành công`);
    } catch (error) {
      console.error('Error toggling quiz status:', error);
      toast.error('Không thể thay đổi trạng thái bài thi');
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    setConfirmDelete({ id, isOpen: true });
  };

  const executeDeleteQuiz = async (id: string) => {
    setSaving(true);
    try {
      // Delete questions first
      const questionsSnapshot = await getDocs(collection(db, 'quizzes', id, 'questions'));
      const batch = writeBatch(db);
      questionsSnapshot.docs.forEach(d => batch.delete(d.ref));
      
      // Delete quiz
      batch.delete(doc(db, 'quizzes', id));
      await batch.commit();
      toast.success('Đã xóa bài thi thành công.');
    } catch (error) {
      console.error('Error deleting quiz:', error);
      handleFirestoreError(error, OperationType.DELETE, 'quizzes');
      toast.error('Có lỗi xảy ra khi xóa bài thi.');
    } finally {
      setSaving(false);
      setConfirmDelete({ id: '', isOpen: false });
    }
  };

  const addQuestion = useCallback(() => {
    setEditingQuestions(prev => [...prev, {
      id: `new-${Date.now()}`,
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
          <h1 className="text-2xl font-sans font-bold text-blue-950 mb-2">Quản lý bài thi</h1>
          <p className="text-stone-500">Tạo mới và quản lý các bộ đề thi trắc nghiệm.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={handleDownloadSample}
            className="flex items-center justify-center gap-2 bg-white text-emerald-600 py-2 px-4 rounded-lg hover:bg-emerald-50 transition-all font-medium border border-emerald-200 text-sm"
          >
            <Download className="w-4 h-4" />
            Tải file mẫu (Word)
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-stone-100 text-stone-600 py-2 px-4 rounded-lg hover:bg-stone-200 transition-all font-medium border border-stone-200 text-sm"
          >
            <Upload className="w-4 h-4" />
            Nhập đề thi (Word/JSON)
          </button>
          <button
            onClick={handleCreateNew}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-all font-medium shadow-lg shadow-emerald-200 text-sm"
          >
            <Plus className="w-4 h-4" />
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
                    <div className="text-sm font-medium text-stone-900">{quiz.title}</div>
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
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleQuizStatus(quiz)}
                        title={quiz.isActive ? "Đóng bài thi" : "Mở bài thi"}
                        className={cn(
                          "relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2",
                          quiz.isActive ? "bg-emerald-600" : "bg-stone-300"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                            quiz.isActive ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                      <span className={cn(
                        "text-xs font-medium min-w-[60px]",
                        quiz.isActive ? "text-emerald-700" : "text-stone-500"
                      )}>
                        {quiz.isActive ? "Đang mở" : "Đã đóng"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-500">
                    {formatDate(quiz.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => setStatsQuiz(quiz)}
                        title="Thống kê câu hỏi hay sai"
                        className="p-2 text-stone-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
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
      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title="Xác nhận xóa?"
        message="Bạn có chắc chắn muốn xóa bài thi này? Tất cả dữ liệu liên quan sẽ bị mất và không thể hoàn tác."
        confirmLabel="Xóa ngay"
        cancelLabel="Hủy bỏ"
        onConfirm={() => executeDeleteQuiz(confirmDelete.id)}
        onCancel={() => setConfirmDelete({ id: '', isOpen: false })}
        variant="danger"
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)} />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <h2 className="text-2xl font-sans font-bold text-blue-950">
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

                  {/* Special Attempt Limits */}
                  <div className="md:col-span-2 p-6 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <Users className="w-4 h-4" /> Cấu hình lượt thi đặc biệt (Lớp/Học sinh)
                      </h4>
                      <button
                        onClick={() => {
                          const currentLimits = editingQuiz?.specialAttemptLimits || [];
                          setEditingQuiz({
                            ...editingQuiz,
                            specialAttemptLimits: [...currentLimits, { type: 'class', targetId: '', maxAttempts: 1 }]
                          });
                        }}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Thêm cấu hình
                      </button>
                    </div>
                    
                    {editingQuiz?.specialAttemptLimits && editingQuiz.specialAttemptLimits.length > 0 ? (
                      <div className="space-y-3">
                        {editingQuiz.specialAttemptLimits.map((limit, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-xl border border-stone-100">
                            <select
                              value={limit.type}
                              onChange={(e) => {
                                const newLimits = [...editingQuiz.specialAttemptLimits!];
                                newLimits[idx] = { ...limit, type: e.target.value as any };
                                setEditingQuiz({ ...editingQuiz, specialAttemptLimits: newLimits });
                              }}
                              className="w-full sm:w-32 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs"
                            >
                              <option value="class">Lớp</option>
                              <option value="student">Học sinh</option>
                            </select>
                            {limit.type === 'class' ? (
                              <select
                                value={limit.targetId}
                                onChange={(e) => {
                                  const newLimits = [...editingQuiz.specialAttemptLimits!];
                                  newLimits[idx] = { ...limit, targetId: e.target.value };
                                  setEditingQuiz({ ...editingQuiz, specialAttemptLimits: newLimits });
                                }}
                                className="flex-1 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs"
                              >
                                <option value="">Chọn lớp...</option>
                                {availableClasses.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            ) : (
                              <select
                                value={limit.targetId}
                                onChange={(e) => {
                                  const newLimits = [...editingQuiz.specialAttemptLimits!];
                                  newLimits[idx] = { ...limit, targetId: e.target.value };
                                  setEditingQuiz({ ...editingQuiz, specialAttemptLimits: newLimits });
                                }}
                                className="flex-1 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs"
                              >
                                <option value="">Chọn học sinh...</option>
                                {allUsers.filter(u => u.role !== 'admin').map(u => (
                                  <option key={u.uid} value={u.uid}>
                                    {u.displayName || u.email.split('@')[0]} ({u.class || 'N/A'})
                                  </option>
                                ))}
                              </select>
                            )}
                            <div className="flex items-center gap-2 shrink-0">
                              <label className="text-[10px] font-bold text-stone-400 uppercase">Lượt:</label>
                              <input
                                type="number"
                                value={limit.maxAttempts}
                                onChange={(e) => {
                                  const newLimits = [...editingQuiz.specialAttemptLimits!];
                                  newLimits[idx] = { ...limit, maxAttempts: Number(e.target.value) };
                                  setEditingQuiz({ ...editingQuiz, specialAttemptLimits: newLimits });
                                }}
                                className="w-16 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs"
                              />
                            </div>
                            <button
                              onClick={() => {
                                const newLimits = editingQuiz.specialAttemptLimits!.filter((_, i) => i !== idx);
                                setEditingQuiz({ ...editingQuiz, specialAttemptLimits: newLimits });
                              }}
                              className="p-1.5 text-stone-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 italic">Chưa có cấu hình đặc biệt nào.</p>
                    )}
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
                    {['student', 'student-vip', 'guest'].map((role) => (
                      <div key={role} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`role-${role}`}
                          checked={editingQuiz?.allowedRoles?.includes(role as any) ?? true}
                          onChange={(e) => {
                            const currentRoles = editingQuiz?.allowedRoles || ['student', 'student-vip', 'guest'];
                            const newRoles = e.target.checked 
                              ? [...currentRoles, role as any]
                              : currentRoles.filter(r => r !== role);
                            setEditingQuiz({ ...editingQuiz, allowedRoles: newRoles });
                          }}
                          className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <label htmlFor={`role-${role}`} className="text-sm text-stone-600 capitalize">
                          {role === 'student' ? 'Học sinh' : role === 'student-vip' ? 'Học sinh-VIP' : 'Khách'}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-medium text-stone-700 block">Vai trò được phép xem lại bài thi</label>
                  <div className="flex flex-wrap gap-6">
                    {['student', 'student-vip', 'guest'].map((role) => (
                      <div key={`review-${role}`} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`review-role-${role}`}
                          checked={editingQuiz?.reviewRoles?.includes(role as any) ?? true}
                          onChange={(e) => {
                            const currentRoles = editingQuiz?.reviewRoles || ['student', 'student-vip', 'guest'];
                            const newRoles = e.target.checked 
                              ? [...currentRoles, role as any]
                              : currentRoles.filter(r => r !== role);
                            setEditingQuiz({ ...editingQuiz, reviewRoles: newRoles });
                          }}
                          className="w-5 h-5 rounded border-stone-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`review-role-${role}`} className="text-sm text-stone-600 capitalize">
                          {role === 'student' ? 'Học sinh' : role === 'student-vip' ? 'Học sinh-VIP' : 'Khách'}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Security Settings */}
                <section className="space-y-6 pt-6 border-t border-stone-100">
                  <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Cấu hình bảo mật thi
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200">
                        <div>
                          <p className="text-sm font-bold text-stone-900">Giám sát chuyển Tab/Cửa sổ</p>
                          <p className="text-xs text-stone-500">Ghi lại vi phạm khi học sinh rời khỏi màn hình thi</p>
                        </div>
                        <button
                          onClick={() => {
                            const currentSettings = editingQuiz?.securitySettings || { preventTabSwitch: false, maxViolations: 0, autoSubmitOnMaxViolations: false, showWarningOnViolation: true };
                            setEditingQuiz({ ...editingQuiz, securitySettings: { ...currentSettings, preventTabSwitch: !currentSettings.preventTabSwitch } });
                          }}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            editingQuiz?.securitySettings?.preventTabSwitch ? "bg-red-600" : "bg-stone-300"
                          )}
                        >
                          <span className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            editingQuiz?.securitySettings?.preventTabSwitch ? "translate-x-6" : "translate-x-1"
                          )} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200">
                        <div>
                          <p className="text-sm font-bold text-stone-900">Hiển thị cảnh báo vi phạm</p>
                          <p className="text-xs text-stone-500">Hiện thông báo nhắc nhở ngay khi học sinh vi phạm</p>
                        </div>
                        <button
                          onClick={() => {
                            const currentSettings = editingQuiz?.securitySettings || { preventTabSwitch: false, maxViolations: 0, autoSubmitOnMaxViolations: false, showWarningOnViolation: true };
                            setEditingQuiz({ ...editingQuiz, securitySettings: { ...currentSettings, showWarningOnViolation: !currentSettings.showWarningOnViolation } });
                          }}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            editingQuiz?.securitySettings?.showWarningOnViolation ?? true ? "bg-emerald-600" : "bg-stone-300"
                          )}
                        >
                          <span className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            editingQuiz?.securitySettings?.showWarningOnViolation ?? true ? "translate-x-6" : "translate-x-1"
                          )} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200">
                        <div>
                          <p className="text-sm font-bold text-stone-900">Đảo thứ tự câu hỏi</p>
                          <p className="text-xs text-stone-500">Xáo trộn vị trí các câu hỏi trong đề thi</p>
                        </div>
                        <button
                          onClick={() => {
                            const currentSettings = editingQuiz?.securitySettings || { preventTabSwitch: false, maxViolations: 0, autoSubmitOnMaxViolations: false, showWarningOnViolation: true, shuffleQuestions: true, shuffleOptions: true };
                            setEditingQuiz({ ...editingQuiz, securitySettings: { ...currentSettings, shuffleQuestions: !currentSettings.shuffleQuestions } });
                          }}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            editingQuiz?.securitySettings?.shuffleQuestions ?? true ? "bg-emerald-600" : "bg-stone-300"
                          )}
                        >
                          <span className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            editingQuiz?.securitySettings?.shuffleQuestions ?? true ? "translate-x-6" : "translate-x-1"
                          )} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200">
                        <div>
                          <p className="text-sm font-bold text-stone-900">Đảo thứ tự phương án</p>
                          <p className="text-xs text-stone-500">Xáo trộn vị trí các đáp án trong mỗi câu hỏi</p>
                        </div>
                        <button
                          onClick={() => {
                            const currentSettings = editingQuiz?.securitySettings || { preventTabSwitch: false, maxViolations: 0, autoSubmitOnMaxViolations: false, showWarningOnViolation: true, shuffleQuestions: true, shuffleOptions: true };
                            setEditingQuiz({ ...editingQuiz, securitySettings: { ...currentSettings, shuffleOptions: !currentSettings.shuffleOptions } });
                          }}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            editingQuiz?.securitySettings?.shuffleOptions ?? true ? "bg-emerald-600" : "bg-stone-300"
                          )}
                        >
                          <span className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            editingQuiz?.securitySettings?.shuffleOptions ?? true ? "translate-x-6" : "translate-x-1"
                          )} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-stone-700">Số lần vi phạm tối đa (0 = không giới hạn)</label>
                        <input
                          type="number"
                          value={editingQuiz?.securitySettings?.maxViolations || 0}
                          onChange={(e) => {
                            const currentSettings = editingQuiz?.securitySettings || { preventTabSwitch: false, maxViolations: 0, autoSubmitOnMaxViolations: false, showWarningOnViolation: true };
                            setEditingQuiz({ ...editingQuiz, securitySettings: { ...currentSettings, maxViolations: Number(e.target.value) } });
                          }}
                          className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          placeholder="VD: 3"
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200">
                        <div>
                          <p className="text-sm font-bold text-stone-900">Tự động nộp bài khi hết lượt</p>
                          <p className="text-xs text-stone-500">Nộp bài ngay khi đạt số lần vi phạm tối đa</p>
                        </div>
                        <button
                          disabled={!editingQuiz?.securitySettings?.maxViolations}
                          onClick={() => {
                            const currentSettings = editingQuiz?.securitySettings || { preventTabSwitch: false, maxViolations: 0, autoSubmitOnMaxViolations: false, showWarningOnViolation: true };
                            setEditingQuiz({ ...editingQuiz, securitySettings: { ...currentSettings, autoSubmitOnMaxViolations: !currentSettings.autoSubmitOnMaxViolations } });
                          }}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50",
                            editingQuiz?.securitySettings?.autoSubmitOnMaxViolations ? "bg-red-600" : "bg-stone-300"
                          )}
                        >
                          <span className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            editingQuiz?.securitySettings?.autoSubmitOnMaxViolations ? "translate-x-6" : "translate-x-1"
                          )} />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
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
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="questions">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                          {editingQuestions.map((q, qIndex) => (
                            <Draggable key={q.id || `q-${qIndex}`} draggableId={q.id || `q-${qIndex}`} index={qIndex}>
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                >
                                  <QuestionEditor
                                    q={q}
                                    qIndex={qIndex}
                                    onUpdate={updateQuestion}
                                    onUpdateOption={updateOption}
                                    onRemove={removeQuestion}
                                    isExpanded={!!expandedQuestions[qIndex]}
                                    onToggleExpand={toggleExpand}
                                    dragHandleProps={provided.dragHandleProps}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
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
      {statsQuiz && (
        <QuizStatsModal 
          quiz={statsQuiz} 
          onClose={() => setStatsQuiz(null)} 
        />
      )}
    </div>
  );
}
