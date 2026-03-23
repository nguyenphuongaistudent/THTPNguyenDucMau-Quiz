import React, { useState } from 'react';
import { UserCircle, School, BookOpen, Save, Loader2, XCircle, X } from 'lucide-react';
import { setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';

interface ProfileModalProps {
  user: User;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function ProfileModal({ user, onClose, onUpdate }: ProfileModalProps) {
  const [profileForm, setProfileForm] = useState({ 
    displayName: user.displayName || '', 
    school: user.school || '', 
    class: user.class || '' 
  });
  const [saving, setSaving] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        ...profileForm
      }, { merge: true });
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Có lỗi xảy ra khi cập nhật thông tin.');
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
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
              placeholder="Nhập họ và tên"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
              <School className="w-4 h-4" /> Trường học
            </label>
            <input
              type="text"
              value={profileForm.school}
              onChange={(e) => setProfileForm({ ...profileForm, school: e.target.value })}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
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
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
              placeholder="Nhập tên lớp"
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
