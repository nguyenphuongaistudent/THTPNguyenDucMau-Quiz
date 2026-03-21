import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { User as AppUser } from './types';
import { LogIn, LogOut, BookOpen, Loader2 } from 'lucide-react';
import { cn } from './lib/utils';

// Pages
import Home from './pages/Home';
import AdminDashboard from './pages/AdminDashboard';
import TakeQuiz from './pages/TakeQuiz';
import Results from './pages/Results';

type Page = 'home' | 'admin' | 'take-quiz' | 'results';

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        const isAdminEmail = firebaseUser.email === 'nguyenphuongaistudent@gmail.com';
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as AppUser;
          // If it's the admin email but role is not admin, override it for the UI
          if (isAdminEmail && userData.role !== 'admin') {
            setUser({ ...userData, role: 'admin' });
          } else {
            setUser(userData);
          }
        } else {
          // Fallback if doc creation in signInWithGoogle failed or was delayed
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || '',
            role: isAdminEmail ? 'admin' : 'student',
            createdAt: null as any
          } as AppUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const navigate = (page: Page, quizId: string | null = null) => {
    setCurrentPage(page);
    setSelectedQuizId(quizId);
    window.scrollTo(0, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-stone-200 p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 mb-2 italic">EduQuiz Pro</h1>
          <p className="text-stone-500 mb-8">Nền tảng thi trắc nghiệm trực tuyến chuyên nghiệp và bảo mật.</p>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-colors font-medium"
          >
            <LogIn className="w-5 h-5" />
            Đăng nhập với Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div 
              className="flex items-center gap-2 cursor-pointer" 
              onClick={() => navigate('home')}
            >
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-serif italic font-medium tracking-tight">EduQuiz</span>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('home')}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  currentPage === 'home' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                )}
              >
                Trang chủ
              </button>
              
              <button
                onClick={() => navigate('results')}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  currentPage === 'results' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                )}
              >
                Kết quả
              </button>

              {user.role === 'admin' && (
                <button
                  onClick={() => navigate('admin')}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    currentPage === 'admin' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                  )}
                >
                  Quản lý
                </button>
              )}

              <div className="h-6 w-px bg-stone-200 mx-2" />

              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium leading-none">{user.displayName}</p>
                  <p className="text-xs text-stone-500 mt-1 capitalize">{user.role}</p>
                </div>
                <button
                  onClick={logout}
                  className="p-2 text-stone-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Đăng xuất"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {currentPage === 'home' && <Home user={user} onTakeQuiz={(id) => navigate('take-quiz', id)} />}
        {currentPage === 'admin' && user.role === 'admin' && <AdminDashboard user={user} />}
        {currentPage === 'take-quiz' && selectedQuizId && (
          <TakeQuiz 
            quizId={selectedQuizId} 
            user={user} 
            onComplete={() => navigate('results')} 
            onCancel={() => navigate('home')}
          />
        )}
        {currentPage === 'results' && <Results user={user} />}
      </main>

      <footer className="border-t border-stone-200 py-12 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-stone-400 text-sm">© 2026 EduQuiz Pro. Nền tảng giáo dục trực tuyến.</p>
        </div>
      </footer>
    </div>
  );
}
