import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logout, signUpWithEmail, sendPasswordReset, sendVerification, signInWithUsernameOrEmail } from './firebase';
import { User as AppUser } from './types';
import { LogIn, LogOut, BookOpen, Loader2, AlertCircle, Clock, Mail, Lock, User as UserIcon, ArrowLeft, Settings } from 'lucide-react';
import ProfileModal from './components/ProfileModal';
import { cn } from './lib/utils';
import { Toaster } from 'sonner';

// Pages
import Home from './pages/Home';
import AdminDashboard from './pages/AdminDashboard';
import TakeQuiz from './pages/TakeQuiz';
import Results from './pages/Results';
import UserManagement from './pages/UserManagement';
import Leaderboard from './pages/Leaderboard';
import Landing from './pages/Landing';

type Page = 'home' | 'admin' | 'take-quiz' | 'results' | 'users' | 'leaderboard';

type AuthMode = 'login' | 'register' | 'landing' | 'forgot-password';

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('landing');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [school, setSchool] = useState('');
  const [className, setClassName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    // Listen for registration setting
    const settingsRef = doc(db, 'settings', 'registration');
    const unsubscribeSettings = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        setRegistrationEnabled(doc.data().enabled ?? true);
      }
    }, (error) => {
      console.error("Error listening to settings:", error);
    });

    let userUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (userUnsubscribe) {
        userUnsubscribe();
        userUnsubscribe = null;
      }

      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        let userDoc = await getDoc(userRef);
        const isAdminEmail = firebaseUser.email === 'nguyenphuongaistudent@gmail.com';
        
        if (!userDoc.exists() && firebaseUser.email) {
          // Check if there's an imported user with this email
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', firebaseUser.email));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const importedDoc = querySnapshot.docs[0];
            const importedData = importedDoc.data();
            // Remove password from the data to be linked
            const { password, ...safeData } = importedData;
            
            // Link this auth user to the imported data
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              ...safeData,
              uid: firebaseUser.uid,
              username: safeData.username || firebaseUser.email.split('@')[0],
              school: safeData.school || 'Trường Tự do',
              class: safeData.class || 'Tự do',
              updatedAt: serverTimestamp()
            });
            // Delete the old imported doc if it wasn't using the UID as ID
            if (importedDoc.id !== firebaseUser.uid) {
              await deleteDoc(doc(db, 'users', importedDoc.id));
            }
            userDoc = await getDoc(userRef);
          }
        }

        // Set up real-time listener for user data
        userUnsubscribe = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            const userData = doc.data() as AppUser;
            if (isAdminEmail && (userData.role !== 'admin' || !userData.isApproved)) {
              setUser({ ...userData, role: 'admin', isApproved: true, emailVerified: firebaseUser.emailVerified });
            } else {
              setUser({ ...userData, emailVerified: firebaseUser.emailVerified });
            }
          } else {
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              role: isAdminEmail ? 'admin' : 'student',
              isApproved: isAdminEmail,
              createdAt: null as any,
              emailVerified: firebaseUser.emailVerified
            } as AppUser);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error listening to user data:", error);
          setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      unsubscribeSettings();
      if (userUnsubscribe) userUnsubscribe();
    };
  }, []);

  const navigate = (page: Page, quizId: string | null = null) => {
    setCurrentPage(page);
    setSelectedQuizId(quizId);
    window.scrollTo(0, 0);
  };

  const handleLogin = async () => {
    setLoginError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error('Login failed:', error);
      let message = 'Đăng nhập thất bại. Vui lòng thử lại.';
      if (error.code === 'auth/popup-closed-by-user') {
        message = 'Cửa sổ đăng nhập đã bị đóng.';
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        message = 'Email này đã được đăng ký bằng mật khẩu. Vui lòng đăng nhập bằng email và mật khẩu trước.';
      } else if (error.message?.includes('auth/unauthorized-domain')) {
        message = 'Tên miền này chưa được cấp phép trong Firebase Console.';
      } else if (error.message?.includes('auth/popup-blocked')) {
        message = 'Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép hiện cửa sổ bật lên.';
      }
      setLoginError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setAuthLoading(true);
    try {
      await signInWithUsernameOrEmail(email, password);
    } catch (error: any) {
      console.error('Email sign in failed:', error);
      let message = error.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại email và mật khẩu.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        message = 'Email hoặc mật khẩu không chính xác.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Tài khoản đã bị tạm khóa do nhập sai quá nhiều lần. Vui lòng thử lại sau.';
      } else if (error.code === 'auth/operation-not-allowed') {
        message = 'AUTH_CONFIG_ERROR';
      }
      setLoginError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registrationEnabled) {
      setLoginError('Chức năng đăng ký hiện đang tạm khóa bởi Quản trị viên.');
      return;
    }
    setLoginError(null);
    setAuthLoading(true);
    try {
      if (password.length < 6) {
        throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
      }
      if (!username || !displayName) {
        throw new Error('Vui lòng điền đầy đủ các thông tin bắt buộc.');
      }
      
      const finalSchool = school.trim() || 'Trường Tự do';
      const finalClass = className.trim() || 'Tự do';
      
      await signUpWithEmail(email, password, displayName, username, finalSchool, finalClass);
    } catch (error: any) {
      console.error('Email sign up failed:', error);
      let message = 'Đăng ký thất bại. Vui lòng thử lại.';
      if (error.code === 'auth/email-already-in-use') {
        message = 'Email này đã được sử dụng bởi một tài khoản khác.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Email không hợp lệ.';
      } else if (error.code === 'auth/weak-password') {
        message = 'Mật khẩu quá yếu.';
      } else if (error.code === 'auth/operation-not-allowed') {
        message = 'AUTH_CONFIG_ERROR';
      } else if (error.message) {
        message = error.message;
      }
      setLoginError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSuccess(null);
    setAuthLoading(true);
    try {
      await sendPasswordReset(email);
      setLoginSuccess('Link đặt lại mật khẩu đã được gửi đến email của bạn.');
    } catch (error: any) {
      console.error('Password reset failed:', error);
      let message = 'Gửi yêu cầu thất bại. Vui lòng kiểm tra lại email.';
      if (error.code === 'auth/user-not-found') {
        message = 'Không tìm thấy tài khoản với email này.';
      }
      setLoginError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!user) {
    if (authMode === 'landing') {
      return (
        <Landing 
          onLogin={() => setAuthMode('login')} 
          onRegister={() => {
            if (registrationEnabled) {
              setAuthMode('register');
            } else {
              setLoginError('Chức năng đăng ký hiện đang tạm khóa.');
              setAuthMode('login');
            }
          }} 
          registrationEnabled={registrationEnabled}
        />
      );
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden relative">
          <button 
            onClick={() => setAuthMode('landing')}
            className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors z-20"
          >
            <AlertCircle className="w-5 h-5 rotate-45" />
          </button>
          <div className="bg-stone-900 p-10 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle,white_1px,transparent_1px)] [background-size:20px_20px]" />
            </div>
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-6 border border-white/20 overflow-hidden">
                <img 
                  src="https://lh3.googleusercontent.com/d/1nJFV426bMfXBj-Ce8neJl-GpSlLTJgmV" 
                  alt="Nguyễn Đức Mậu-QuizPro Logo" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h1 className="text-2xl font-logo font-bold mb-2 italic tracking-tight whitespace-nowrap text-center">Nguyễn Đức Mậu-QuizPro</h1>
              <p className="text-stone-400 text-sm">Nền tảng thi trắc nghiệm trực tuyến chuyên nghiệp</p>
            </div>
          </div>

          <div className="p-8">
            {authMode !== 'forgot-password' && (
              <div className="flex p-1 bg-stone-100 rounded-xl mb-8">
                <button
                  onClick={() => { setAuthMode('login'); setLoginError(null); setLoginSuccess(null); }}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                    authMode === 'login' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                  )}
                >
                  Đăng nhập
                </button>
                {registrationEnabled && (
                  <button
                    onClick={() => { setAuthMode('register'); setLoginError(null); setLoginSuccess(null); }}
                    className={cn(
                      "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                      authMode === 'register' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                    )}
                  >
                    Đăng ký
                  </button>
                )}
              </div>
            )}

            <div className="text-center mb-8">
              <h2 className="text-xl font-medium text-stone-900 mb-2">
                {authMode === 'login' ? <span translate="no">'Chào mừng quay trở lại'</span> : authMode === 'register' ? 'Tạo tài khoản mới' : 'Quên mật khẩu'}
              </h2>
              <p className="text-stone-500 text-sm">
                {authMode === 'login' 
                  ? 'Vui lòng đăng nhập để tiếp tục học tập.' 
                  : authMode === 'register'
                  ? 'Tham gia cộng đồng học tập của chúng tôi ngay hôm nay.'
                  : 'Nhập email của bạn để nhận link đặt lại mật khẩu.'}
              </p>
            </div>
            
            {loginError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex flex-col gap-3 text-left animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 font-medium leading-relaxed">
                    {loginError === 'AUTH_CONFIG_ERROR' 
                      ? 'Tính năng đăng nhập bằng Email chưa được kích hoạt trong Firebase Console.' 
                      : loginError}
                  </p>
                </div>
                {loginError === 'AUTH_CONFIG_ERROR' && (
                  <div className="mt-2 p-3 bg-white rounded-lg border border-red-200 space-y-3">
                    <p className="text-xs text-red-600 font-bold uppercase tracking-wider">Hướng dẫn khắc phục:</p>
                    <ol className="text-xs text-stone-600 space-y-2 list-decimal ml-4">
                      <li>Truy cập <a href="https://console.firebase.google.com/project/gen-lang-client-0315359302/authentication/providers" target="_blank" rel="noopener noreferrer" className="text-emerald-600 font-bold underline">Firebase Console</a></li>
                      <li>Nhấn <strong>"Add new provider"</strong></li>
                      <li>Chọn <strong>"Email/Password"</strong></li>
                      <li>Bật <strong>"Enable"</strong> và nhấn <strong>"Save"</strong></li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            {loginSuccess && (
              <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3 text-left animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-700">{loginSuccess}</p>
              </div>
            )}

            <form 
              onSubmit={authMode === 'login' ? handleEmailSignIn : authMode === 'register' ? handleEmailSignUp : handleForgotPassword}
              className="space-y-4"
            >
              {authMode === 'register' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-wider ml-1">Họ và tên</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-wider ml-1">
                  {authMode === 'login' ? 'Email hoặc Tên đăng nhập' : 'Email'}
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type={authMode === 'login' ? 'text' : 'email'}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={authMode === 'login' ? "example@gmail.com hoặc username" : "example@gmail.com"}
                    className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              {authMode === 'register' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-wider ml-1">Tên đăng nhập</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="username123"
                        className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-400 uppercase tracking-wider ml-1">Trường học</label>
                      <div className="relative">
                        <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                        <input
                          type="text"
                          value={school}
                          onChange={(e) => setSchool(e.target.value)}
                          placeholder="Tên trường"
                          className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-400 uppercase tracking-wider ml-1">Lớp học</label>
                      <div className="relative">
                        <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                        <input
                          type="text"
                          value={className}
                          onChange={(e) => setClassName(e.target.value)}
                          placeholder="Tên lớp"
                          className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {authMode !== 'forgot-password' && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Mật khẩu</label>
                    {authMode === 'login' && (
                      <button 
                        type="button"
                        onClick={() => { setAuthMode('forgot-password'); setLoginError(null); setLoginSuccess(null); }}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        Quên mật khẩu?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-emerald-600 text-white py-4 px-6 rounded-xl hover:bg-emerald-700 transition-all font-medium shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  authMode === 'login' ? 'Đăng nhập' : authMode === 'register' ? 'Đăng ký' : 'Gửi yêu cầu'
                )}
              </button>
            </form>

            {authMode === 'forgot-password' && (
              <button
                onClick={() => { setAuthMode('login'); setLoginError(null); setLoginSuccess(null); }}
                className="mt-6 w-full flex items-center justify-center gap-2 text-stone-500 hover:text-stone-900 transition-colors text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" /> Quay lại đăng nhập
              </button>
            )}

            {authMode !== 'forgot-password' && (
              <>
                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-4 text-stone-400 font-bold tracking-widest">Hoặc</span>
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={authLoading}
                  className="w-full flex items-center justify-center gap-3 bg-white border border-stone-200 text-stone-700 py-4 px-6 rounded-xl hover:bg-stone-50 transition-all font-medium shadow-sm active:scale-[0.98] disabled:opacity-50"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                  Tiếp tục với Google
                </button>
              </>
            )}

            <p className="mt-8 text-center text-xs text-stone-400 leading-relaxed">
              Bằng cách tiếp tục, bạn đồng ý với <span className="underline cursor-pointer">Điều khoản dịch vụ</span> và <span className="underline cursor-pointer">Chính sách bảo mật</span> của chúng tôi.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user.isApproved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-10 text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-pulse">
            <Clock className="w-10 h-10 text-amber-600" />
          </div>
          <h1 className="text-2xl font-sans font-bold text-blue-950 mb-4">Đang chờ phê duyệt</h1>
          <p className="text-stone-500 mb-8 leading-relaxed">
            Tài khoản của bạn đã được đăng ký thành công. Vui lòng đợi Quản trị viên hoặc Giáo viên phê duyệt để bắt đầu sử dụng hệ thống.
          </p>
          
          <div className="space-y-4">
            <div className="p-4 bg-stone-50 rounded-2xl text-left border border-stone-100">
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Email của bạn</p>
              <div className="flex items-center justify-between">
                <p className="text-stone-900 font-medium">{user.email}</p>
                {user.emailVerified ? (
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold uppercase">Đã xác thực</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold uppercase">Chưa xác thực</span>
                )}
              </div>
            </div>

            {!user.emailVerified && (
              <button
                onClick={async () => {
                  try {
                    await sendVerification();
                    setLoginSuccess('Email xác thực đã được gửi lại.');
                    setTimeout(() => setLoginSuccess(null), 5000);
                  } catch (e) {
                    setLoginError('Không thể gửi email xác thực. Vui lòng thử lại sau.');
                    setTimeout(() => setLoginError(null), 5000);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 py-3 px-6 rounded-xl hover:bg-emerald-100 transition-colors font-medium text-sm border border-emerald-100"
              >
                <Mail className="w-4 h-4" />
                Gửi lại email xác thực
              </button>
            )}

            {loginSuccess && (
              <p className="text-xs text-emerald-600 font-medium animate-in fade-in slide-in-from-top-1">{loginSuccess}</p>
            )}
            {loginError && (
              <p className="text-xs text-red-600 font-medium animate-in fade-in slide-in-from-top-1">{loginError}</p>
            )}
            
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 text-stone-500 py-3 px-6 rounded-xl hover:bg-stone-100 transition-colors font-medium"
            >
              <LogOut className="w-5 h-5" />
              Đăng xuất
            </button>
          </div>
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
              <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center overflow-hidden">
                <img 
                  src="https://lh3.googleusercontent.com/d/1nJFV426bMfXBj-Ce8neJl-GpSlLTJgmV" 
                  alt="Nguyễn Đức Mậu-QuizPro Logo" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <span className="text-lg font-logo italic font-bold tracking-tight whitespace-nowrap">Nguyễn Đức Mậu-QuizPro</span>
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
                onClick={() => navigate('leaderboard')}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  currentPage === 'leaderboard' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                )}
              >
                Xếp hạng
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

              {(user.role === 'admin' || user.role === 'teacher') && (
                <>
                  <button
                    onClick={() => navigate('users')}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      currentPage === 'users' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                    )}
                  >
                    Thành viên
                  </button>
                  <button
                    onClick={() => navigate('admin')}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      currentPage === 'admin' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                    )}
                  >
                    Quản lý đề
                  </button>
                </>
              )}

              <div className="h-6 w-px bg-stone-200 mx-2" />

              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium leading-none">{user.displayName}</p>
                  <p className="text-xs text-stone-500 mt-1 capitalize">
                    {user.role === 'student-vip' ? 'Học sinh-VIP' : 
                     user.role === 'student' ? 'Học sinh' : 
                     user.role === 'teacher' ? 'Giáo viên' : 
                     user.role === 'admin' ? 'Quản trị viên' : 'Khách'}
                  </p>
                </div>
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="p-2 text-stone-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title="Chỉnh sửa thông tin cá nhân"
                >
                  <Settings className="w-5 h-5" />
                </button>
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
        {currentPage === 'leaderboard' && <Leaderboard />}
        {currentPage === 'admin' && (user.role === 'admin' || user.role === 'teacher') && <AdminDashboard user={user} />}
        {currentPage === 'users' && (user.role === 'admin' || user.role === 'teacher') && <UserManagement currentUser={user} />}
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

      {isProfileOpen && (
        <ProfileModal 
          user={user} 
          onClose={() => setIsProfileOpen(false)} 
          onUpdate={() => {
            // Force re-fetch user data if needed, but onSnapshot in App.tsx handles it
          }}
        />
      )}

      <Toaster position="top-right" richColors closeButton />

      <footer className="border-t border-stone-200 py-12 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-stone-400 text-sm">© 2026 Nguyễn Đức Mậu-QuizPro. Nền tảng giáo dục trực tuyến.</p>
        </div>
      </footer>
    </div>
  );
}
