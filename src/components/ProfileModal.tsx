import React, { useState } from 'react';
import { UserCircle, School, BookOpen, Save, Loader2, XCircle, X, Mail, Lock, Key } from 'lucide-react';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, updateUserEmail, updateUserPassword, reauthenticateUser } from '../firebase';
import { User } from '../types';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface ProfileModalProps {
  user: User;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function ProfileModal({ user, onClose, onUpdate }: ProfileModalProps) {
  const [profileForm, setProfileForm] = useState({ 
    displayName: user.displayName || '', 
    school: user.school || '', 
    class: user.class || '',
    email: user.email || '',
    currentPassword: ''
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

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
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error('Mật khẩu xác nhận không khớp.');
        }
        if (newPassword.length < 6) {
          throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự.');
        }
        await updateUserPassword(newPassword);
      }

      // 4. Update Firestore fields
      const updateData: any = {
        updatedAt: serverTimestamp()
      };

      if (!emailChanged) {
        updateData.email = profileForm.email;
      }

      if (user.role === 'admin') {
        updateData.displayName = profileForm.displayName;
        updateData.school = profileForm.school;
        updateData.class = profileForm.class;
        if (emailChanged) updateData.email = profileForm.email;
      }

      await setDoc(doc(db, 'users', user.uid), updateData, { merge: true });

      if (emailChanged) {
        toast.success('Một email xác nhận đã được gửi đến địa chỉ mới. Vui lòng kiểm tra hộp thư để hoàn tất thay đổi.');
      } else {
        toast.success('Cập nhật thông tin thành công!');
      }
      if (onUpdate) onUpdate();
      onClose();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      let message = 'Có lỗi xảy ra khi cập nhật thông tin.';
      if (error.code === 'auth/requires-recent-login') {
        message = 'Vui lòng đăng xuất và đăng nhập lại để thực hiện thay đổi email hoặc mật khẩu.';
      } else if (error.message) {
        message = error.message;
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <h2 className="text-xl font-serif italic font-medium">Thông tin cá nhân</h2>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleUpdateProfile} className="p-8 space-y-4">
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
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Địa chỉ Email
            </label>
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              placeholder="example@gmail.com"
            />
          </div>

          <div className="border-t border-stone-100 pt-4 mt-4">
            <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4">Đổi mật khẩu (Để trống nếu không đổi)</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Mật khẩu mới
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <Key className="w-4 h-4" /> Xác nhận mật khẩu mới
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>
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
              onClick={onClose}
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
  );
}
