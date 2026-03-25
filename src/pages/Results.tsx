import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Result, User } from '../types';
import { Trophy, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, ChevronRight, BookOpen, User as UserIcon, School } from 'lucide-react';
import { formatDate, cn } from '../lib/utils';

interface ResultsProps {
  user: User;
}

export default function Results({ user }: ResultsProps) {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = (user.role === 'admin' || user.role === 'teacher')
      ? query(collection(db, 'results'), orderBy('completedAt', 'desc'))
      : query(collection(db, 'results'), where('studentUid', '==', user.uid), orderBy('completedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const resultList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Result[];
      setResults(resultList);
      setLoading(false);
    });

    return () => unsubscribe();
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
              {results.length > 0 
                ? (results.reduce((acc, r) => acc + r.score, 0) / results.length).toFixed(1)
                : '0.0'}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-stone-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {results.map((result) => (
            <div 
              key={result.id}
              className="group bg-white rounded-2xl border border-stone-200 p-6 hover:shadow-lg hover:shadow-stone-200/40 transition-all flex flex-col md:flex-row md:items-center gap-6"
            >
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
                  <h3 className="text-lg font-medium text-stone-900 break-words min-w-0">{result.quizTitle || "Bài thi trắc nghiệm"}</h3>
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
            </div>
          ))}
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
    </div>
  );
}
