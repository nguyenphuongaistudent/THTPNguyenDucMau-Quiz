import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, setDoc, doc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { User, UserRole } from '../types';
import { Users, UserPlus, Trash2, Shield, GraduationCap, UserCircle, Loader2, Search, Mail, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface UserManagementProps {
  currentUser: User;
}

export default function UserManagement({ currentUser }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('student');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as User[];
      setUsers(userList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;

    setSaving(true);
    try {
      // Create a document with a random ID, but with the email and role
      // When the user signs in with Google, we'll merge this
      await addDoc(collection(db, 'users'), {
        email: newEmail,
        role: newRole,
        isApproved: true,
        createdAt: serverTimestamp(),
        uid: `pre_${Date.now()}` // Temporary ID
      });
      setNewEmail('');
      setIsAdding(false);
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Có lỗi xảy ra khi thêm người dùng.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRole = async (uid: string, role: UserRole) => {
    if (currentUser.role !== 'admin' && role === 'admin') {
      alert('Chỉ quản trị viên mới có thể cấp quyền Admin.');
      return;
    }
    try {
      await setDoc(doc(db, 'users', uid), { role }, { merge: true });
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Có lỗi xảy ra khi cập nhật vai trò.');
    }
  };

  const handleToggleApproval = async (uid: string, currentStatus: boolean) => {
    try {
      await setDoc(doc(db, 'users', uid), { isApproved: !currentStatus }, { merge: true });
    } catch (error) {
      console.error('Error toggling approval:', error);
      alert('Có lỗi xảy ra khi cập nhật trạng thái phê duyệt.');
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa người dùng này?')) {
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Có lỗi xảy ra khi xóa người dùng.');
      }
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4 text-red-500" />;
      case 'teacher': return <GraduationCap className="w-4 h-4 text-emerald-500" />;
      case 'student': return <UserCircle className="w-4 h-4 text-stone-500" />;
      case 'guest': return <Users className="w-4 h-4 text-stone-400" />;
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'Quản trị viên';
      case 'teacher': return 'Giáo viên';
      case 'student': return 'Học sinh';
      case 'guest': return 'Khách';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-serif font-medium text-stone-900 mb-2 italic">Quản lý thành viên</h1>
          <p className="text-stone-500">Phân quyền và quản lý người dùng trong hệ thống.</p>
        </div>
        
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-all font-medium shadow-lg shadow-stone-200"
        >
          <UserPlus className="w-5 h-5" />
          Thêm thành viên mới
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Tìm kiếm theo email hoặc tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-400 uppercase tracking-wider">
            <Users className="w-4 h-4" /> Tổng số: {users.length}
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-stone-300" />
            <p className="text-stone-400 text-sm">Đang tải danh sách...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50/30 border-b border-stone-100">
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Thành viên</th>
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Vai trò</th>
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Phê duyệt</th>
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Trạng thái</th>
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-stone-50/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-stone-500 font-medium">
                          {user.displayName?.[0] || user.email[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-stone-900">{user.displayName || 'Chưa cập nhật'}</div>
                          <div className="text-xs text-stone-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={(e) => handleUpdateRole(user.uid, e.target.value as UserRole)}
                        disabled={user.uid === currentUser.uid || (currentUser.role !== 'admin' && user.role === 'admin')}
                        className={cn(
                          "text-sm font-medium bg-transparent border-none focus:ring-0 cursor-pointer rounded-lg px-2 py-1 hover:bg-stone-100 transition-colors",
                          user.role === 'admin' ? "text-red-600" : user.role === 'teacher' ? "text-emerald-600" : "text-stone-600"
                        )}
                      >
                        <option value="guest">Khách</option>
                        <option value="student">Học sinh</option>
                        <option value="teacher">Giáo viên</option>
                        {currentUser.role === 'admin' && <option value="admin">Quản trị viên</option>}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleApproval(user.uid, user.isApproved)}
                        disabled={user.uid === currentUser.uid}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all",
                          user.isApproved 
                            ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" 
                            : "text-amber-600 bg-amber-50 hover:bg-amber-100"
                        )}
                      >
                        {user.isApproved ? (
                          <><CheckCircle className="w-3.5 h-3.5" /> Đã duyệt</>
                        ) : (
                          <><Clock className="w-3.5 h-3.5" /> Chờ duyệt</>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        user.uid.startsWith('pre_') ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                      )}>
                        {user.uid.startsWith('pre_') ? "Chờ đăng nhập" : "Đã kích hoạt"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteUser(user.uid)}
                        disabled={user.uid === currentUser.uid || (currentUser.role !== 'admin' && user.role === 'admin')}
                        className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => !saving && setIsAdding(false)} />
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <h2 className="text-xl font-serif italic font-medium">Thêm thành viên mới</h2>
              <button onClick={() => setIsAdding(false)} className="p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Email người dùng
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Vai trò mặc định
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['guest', 'student', 'teacher', 'admin'] as UserRole[])
                    .filter(role => currentUser.role === 'admin' || role !== 'admin')
                    .map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setNewRole(role)}
                        className={cn(
                          "py-2 px-3 rounded-lg text-xs font-medium border transition-all",
                          newRole === role 
                            ? "bg-stone-900 text-white border-stone-900" 
                            : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                        )}
                      >
                        {getRoleLabel(role)}
                      </button>
                    ))}
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="flex-grow py-3 px-6 rounded-xl text-stone-500 font-medium hover:bg-stone-50 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-grow flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-all font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                  Thêm ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
