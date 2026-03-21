import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Quiz, User } from '../types';
import { Clock, ChevronRight, BookOpen, Search, Filter } from 'lucide-react';
import { formatDuration, formatDate } from '../lib/utils';

interface HomeProps {
  user: User;
  onTakeQuiz: (quizId: string) => void;
}

export default function Home({ user, onTakeQuiz }: HomeProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'quizzes'),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc')
    );

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

  const filteredQuizzes = quizzes.filter(quiz => 
    quiz.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    quiz.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-serif font-medium text-stone-900 mb-2 italic">Chào mừng, {user.displayName}</h1>
          <p className="text-stone-500">Chọn một bài thi để bắt đầu kiểm tra kiến thức của bạn.</p>
        </div>
        
        <div className="relative w-full md:w-80">
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

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-stone-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredQuizzes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredQuizzes.map((quiz) => (
            <div 
              key={quiz.id}
              className="group bg-white rounded-2xl border border-stone-200 p-6 hover:shadow-xl hover:shadow-stone-200/50 hover:-translate-y-1 transition-all cursor-pointer flex flex-col"
              onClick={() => onTakeQuiz(quiz.id)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                  <BookOpen className="w-6 h-6 text-stone-400 group-hover:text-emerald-600 transition-colors" />
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 rounded-full text-xs font-medium text-stone-600">
                  <Clock className="w-3 h-3" />
                  {formatDuration(quiz.duration)}
                </div>
              </div>
              
              <h3 className="text-xl font-medium text-stone-900 mb-2 group-hover:text-emerald-700 transition-colors">{quiz.title}</h3>
              <p className="text-stone-500 text-sm line-clamp-2 mb-6 flex-grow">
                {quiz.description || "Không có mô tả cho bài thi này."}
              </p>
              
              <div className="flex items-center justify-between pt-4 border-t border-stone-50">
                <span className="text-xs text-stone-400">Cập nhật: {formatDate(quiz.createdAt)}</span>
                <div className="flex items-center gap-1 text-emerald-600 font-medium text-sm">
                  Bắt đầu <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
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
    </div>
  );
}
