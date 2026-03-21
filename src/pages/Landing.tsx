import React from 'react';
import { BookOpen, Shield, GraduationCap, Users, ArrowRight, CheckCircle } from 'lucide-react';

interface LandingProps {
  onLogin: () => void;
  onRegister: () => void;
}

export default function Landing({ onLogin, onRegister }: LandingProps) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      {/* Hero Section */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-serif italic font-medium tracking-tight">EduQuiz</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={onLogin}
              className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              Đăng nhập
            </button>
            <button 
              onClick={onRegister}
              className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-800 transition-all"
            >
              Đăng ký ngay
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-widest mb-8 border border-emerald-100">
              <Shield className="w-3 h-3" /> Nền tảng bảo mật & tin cậy
            </div>
            <h1 className="text-5xl md:text-7xl font-serif font-medium text-stone-900 mb-8 italic leading-tight">
              Nâng tầm kiến thức với <span className="text-emerald-600">EduQuiz Pro</span>
            </h1>
            <p className="text-xl text-stone-500 mb-12 leading-relaxed max-w-2xl mx-auto">
              Hệ thống thi trắc nghiệm trực tuyến hiện đại dành cho giáo viên và học sinh. Quản lý đề thi dễ dàng, làm bài trực quan và kết quả tức thì.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={onRegister}
                className="w-full sm:w-auto bg-stone-900 text-white px-8 py-4 rounded-2xl font-medium hover:bg-stone-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-stone-200"
              >
                Bắt đầu miễn phí <ArrowRight className="w-5 h-5" />
              </button>
              <button 
                onClick={onLogin}
                className="w-full sm:w-auto bg-white text-stone-900 border border-stone-200 px-8 py-4 rounded-2xl font-medium hover:bg-stone-50 transition-all"
              >
                Xem các bài thi mẫu
              </button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 bg-white border-y border-stone-200">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-stone-50 rounded-2xl flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-stone-900" />
                </div>
                <h3 className="text-xl font-medium">Dành cho Giáo viên</h3>
                <p className="text-stone-500 leading-relaxed">
                  Tạo và quản lý ngân hàng câu hỏi, thiết lập thời gian thi và theo dõi kết quả của học sinh trong thời gian thực.
                </p>
              </div>
              <div className="space-y-4">
                <div className="w-12 h-12 bg-stone-50 rounded-2xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-stone-900" />
                </div>
                <h3 className="text-xl font-medium">Dành cho Học sinh</h3>
                <p className="text-stone-500 leading-relaxed">
                  Giao diện làm bài mượt mà, hỗ trợ đa thiết bị. Xem lại lịch sử thi và phân tích điểm số chi tiết.
                </p>
              </div>
              <div className="space-y-4">
                <div className="w-12 h-12 bg-stone-50 rounded-2xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-stone-900" />
                </div>
                <h3 className="text-xl font-medium">Quản lý & Bảo mật</h3>
                <p className="text-stone-500 leading-relaxed">
                  Hệ thống phê duyệt thành viên nghiêm ngặt, đảm bảo chỉ những người dùng được cấp phép mới có thể tham gia.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="py-20 px-4">
          <div className="max-w-7xl mx-auto bg-stone-900 rounded-[3rem] p-12 md:p-20 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
              <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle,white_1px,transparent_1px)] [background-size:40px_40px]" />
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-serif italic mb-8">Sẵn sàng để bắt đầu?</h2>
              <p className="text-stone-400 mb-12 max-w-xl mx-auto">
                Đăng ký ngay hôm nay và trải nghiệm cách thức thi trắc nghiệm hoàn toàn mới.
              </p>
              <button 
                onClick={onRegister}
                className="bg-emerald-500 text-stone-900 px-10 py-4 rounded-2xl font-bold hover:bg-emerald-400 transition-all inline-flex items-center gap-2"
              >
                Đăng ký tài khoản <CheckCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t border-stone-200">
        <div className="max-w-7xl mx-auto px-4 text-center text-stone-400 text-sm">
          <p>© 2026 EduQuiz Pro. Nền tảng giáo dục trực tuyến hàng đầu.</p>
        </div>
      </footer>
    </div>
  );
}
