import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Result, Quiz, QuizTopic } from '../types';
import { Trophy, Medal, Award, Filter, Search, BookOpen, Hash, Clock, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Leaderboard() {
  const [results, setResults] = useState<Result[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterTopic, setFilterTopic] = useState<string>('all');
  const [filterQuizId, setFilterQuizId] = useState<string>('all');

  const subjects = ['Toán', 'Vật lý', 'Hóa học', 'Sinh học', 'Tiếng Anh', 'Lịch sử', 'Địa lý', 'GDCD', 'Ngữ văn', 'Tin học'];
  const topics = [
    { id: 'regular', label: 'Kiểm tra thường xuyên' },
    { id: 'periodic', label: 'Kiểm tra định kỳ' },
    { id: 'graduation', label: 'Giải đề TN THPT' }
  ];

  useEffect(() => {
    // Fetch quizzes for the filter
    const quizzesUnsubscribe = onSnapshot(collection(db, 'quizzes'), (snapshot) => {
      const quizList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Quiz[];
      setQuizzes(quizList);
    }, (error) => {
      console.error("Error listening to quizzes:", error);
    });

    // Fetch results
    const resultsQuery = query(collection(db, 'results'), orderBy('completedAt', 'desc'));
    const resultsUnsubscribe = onSnapshot(resultsQuery, (snapshot) => {
      const resultList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Result[];
      setResults(resultList);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to results:", error);
      setLoading(false);
    });

    return () => {
      quizzesUnsubscribe();
      resultsUnsubscribe();
    };
  }, []);

  // Process rankings
  const rankings = React.useMemo(() => {
    // 1. Filter results based on UI filters
    let filtered = results.filter(r => {
      const matchSubject = filterSubject === 'all' || r.subject === filterSubject;
      const matchTopic = filterTopic === 'all' || r.topic === filterTopic;
      const matchQuiz = filterQuizId === 'all' || r.quizId === filterQuizId;
      return matchSubject && matchTopic && matchQuiz;
    });

    // 2. Group by user and find their BEST result
    // Best result = highest score, then earliest completion (if scores are tied)
    const bestResultsByUser: Record<string, Result> = {};
    
    filtered.forEach(result => {
      const currentBest = bestResultsByUser[result.studentUid];
      if (!currentBest || result.score > currentBest.score) {
        bestResultsByUser[result.studentUid] = result;
      } else if (result.score === currentBest.score) {
        // If scores are equal, we could use time taken if we had it, 
        // but for now we'll just keep the one that was completed first 
        // (though 'desc' order in query means we see newest first, so we check timestamp)
        if (result.completedAt.toMillis() < currentBest.completedAt.toMillis()) {
          bestResultsByUser[result.studentUid] = result;
        }
      }
    });

    // 3. Convert to array and sort
    return Object.values(bestResultsByUser).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.completedAt.toMillis() - b.completedAt.toMillis();
    });
  }, [results, filterSubject, filterTopic, filterQuizId]);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Trophy className="w-6 h-6 text-yellow-500" />;
      case 1: return <Medal className="w-6 h-6 text-stone-400" />;
      case 2: return <Award className="w-6 h-6 text-amber-600" />;
      default: return <span className="text-stone-400 font-mono font-bold">#{index + 1}</span>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-serif font-medium text-stone-900 mb-2 italic">Bảng xếp hạng</h1>
          <p className="text-stone-500">Vinh danh những học sinh có thành tích xuất sắc nhất.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm flex flex-wrap gap-6 items-end">
        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-3 h-3" /> Môn học
          </label>
          <select
            value={filterSubject}
            onChange={(e) => {
              setFilterSubject(e.target.value);
              setFilterQuizId('all'); // Reset quiz filter when subject changes
            }}
            className="w-full sm:w-48 px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-500 transition-all text-sm"
          >
            <option value="all">Tất cả môn học</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
            <Filter className="w-3 h-3" /> Chủ đề
          </label>
          <select
            value={filterTopic}
            onChange={(e) => {
              setFilterTopic(e.target.value);
              setFilterQuizId('all'); // Reset quiz filter when topic changes
            }}
            className="w-full sm:w-48 px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-500 transition-all text-sm"
          >
            <option value="all">Tất cả chủ đề</option>
            {topics.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
            <Hash className="w-3 h-3" /> Bài thi cụ thể
          </label>
          <select
            value={filterQuizId}
            onChange={(e) => setFilterQuizId(e.target.value)}
            className="w-full sm:w-64 px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-500 transition-all text-sm"
          >
            <option value="all">Tất cả bài thi</option>
            {quizzes
              .filter(q => (filterSubject === 'all' || q.subject === filterSubject) && (filterTopic === 'all' || q.topic === filterTopic))
              .map(q => <option key={q.id} value={q.id}>{q.title}</option>)
            }
          </select>
        </div>

        {(filterSubject !== 'all' || filterTopic !== 'all' || filterQuizId !== 'all') && (
          <button
            onClick={() => {
              setFilterSubject('all');
              setFilterTopic('all');
              setFilterQuizId('all');
            }}
            className="text-sm text-stone-400 hover:text-stone-600 px-2 py-2 transition-colors"
          >
            Xóa lọc
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-stone-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : rankings.length > 0 ? (
        <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="px-8 py-5 text-xs font-bold text-stone-400 uppercase tracking-widest w-20">Hạng</th>
                  <th className="px-8 py-5 text-xs font-bold text-stone-400 uppercase tracking-widest">Thí sinh</th>
                  <th className="px-8 py-5 text-xs font-bold text-stone-400 uppercase tracking-widest">Bài thi</th>
                  <th className="px-8 py-5 text-xs font-bold text-stone-400 uppercase tracking-widest text-center">Điểm số</th>
                  <th className="px-8 py-5 text-xs font-bold text-stone-400 uppercase tracking-widest text-right">Ngày hoàn thành</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rankings.map((result, index) => (
                  <tr 
                    key={result.id} 
                    className={cn(
                      "hover:bg-stone-50/50 transition-colors group",
                      index < 3 ? "bg-stone-50/30" : ""
                    )}
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-center">
                        {getRankIcon(index)}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm",
                          index === 0 ? "bg-yellow-500" : index === 1 ? "bg-stone-400" : index === 2 ? "bg-amber-600" : "bg-stone-200"
                        )}>
                          {result.studentName?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="font-bold text-stone-900 group-hover:text-emerald-600 transition-colors">
                            {result.studentName || 'Người dùng ẩn danh'}
                          </div>
                          <div className="text-xs text-stone-400 flex items-center gap-1">
                            <UserIcon className="w-3 h-3" /> {result.studentUid.substring(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div>
                        <div className="text-sm font-medium text-stone-700">{result.quizTitle}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 rounded text-stone-500 font-bold uppercase tracking-tighter">
                            {result.subject}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 rounded text-emerald-600 font-bold uppercase tracking-tighter">
                            {topics.find(t => t.id === result.topic)?.label || result.topic}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className={cn(
                          "text-2xl font-mono font-bold",
                          result.score >= 8 ? "text-emerald-600" : result.score >= 5 ? "text-stone-900" : "text-red-500"
                        )}>
                          {result.score.toFixed(1)}
                        </span>
                        <span className="text-[10px] text-stone-400 font-bold uppercase">/ 10.0</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex flex-col items-end">
                        <div className="text-sm text-stone-600 font-medium">
                          {new Date(result.completedAt.toMillis()).toLocaleDateString('vi-VN')}
                        </div>
                        <div className="text-xs text-stone-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(result.completedAt.toMillis()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 p-20 text-center shadow-sm">
          <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-stone-200" />
          </div>
          <h2 className="text-2xl font-serif italic font-medium text-stone-900 mb-2">Chưa có dữ liệu xếp hạng</h2>
          <p className="text-stone-500 max-w-md mx-auto">
            Hãy tham gia làm bài thi để trở thành người đầu tiên có tên trên bảng xếp hạng!
          </p>
        </div>
      )}
    </div>
  );
}
