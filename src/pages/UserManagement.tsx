import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, setDoc, doc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { User, UserRole } from '../types';
import * as XLSX from 'xlsx';
import { Users, UserPlus, Trash2, Shield, GraduationCap, UserCircle, Loader2, Search, Mail, CheckCircle, XCircle, Clock, Edit2, School, BookOpen, Save, FileDown, FileUp, Key, Download, ChevronUp, ChevronDown, Filter } from 'lucide-react';
import { cn } from '../lib/utils';
import { sendPasswordReset, signUpWithEmail, checkUsernameUnique, checkEmailUnique } from '../firebase';

interface UserManagementProps {
  currentUser: User;
}

export default function UserManagement({ currentUser }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number } | null>(null);
  const [sortBy, setSortBy] = useState<{ field: keyof User; direction: 'asc' | 'desc' }>({ field: 'createdAt', direction: 'desc' });
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newSchool, setNewSchool] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('student');
  const [editForm, setEditForm] = useState({ displayName: '', school: '', class: '', username: '' });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id // Ensure uid is always the Firestore document ID
      })) as User[];
      setUsers(userList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditForm({
      displayName: user.displayName || '',
      school: user.school || '',
      class: user.class || '',
      username: user.username || ''
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSaving(true);
    try {
      await setDoc(doc(db, 'users', editingUser.uid), {
        ...editForm
      }, { merge: true });
      setEditingUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Có lỗi xảy ra khi cập nhật thông tin.');
    } finally {
      setSaving(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        let count = 0;
        let skipped = 0;
        for (const row of data) {
          const email = row.Email || row.email || row['Email'] || row['email'];
          const username = row.Username || row.username || row['Tên đăng nhập'] || email?.split('@')[0];
          
          if (email) {
            // Check if email or username already exists
            const emailUnique = await checkEmailUnique(email);
            const usernameUnique = username ? await checkUsernameUnique(username) : true;
            
            if (emailUnique && usernameUnique) {
              const uid = `pre_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await setDoc(doc(db, 'users', uid), {
                email: email,
                username: username || email.split('@')[0],
                displayName: row.DisplayName || row.name || row['Họ và tên'] || '',
                school: row.School || row.school || row['Trường'] || '',
                class: row.Class || row.class || row['Lớp'] || '',
                role: (row.Role || row.role || row['Vai trò'] || 'student').toLowerCase(),
                isApproved: true,
                createdAt: serverTimestamp(),
                uid: uid
              });
              count++;
            } else {
              skipped++;
            }
          }
        }
        alert(`Đã nhập thành công ${count} thành viên.${skipped > 0 ? ` Bỏ qua ${skipped} thành viên đã tồn tại.` : ''}`);
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error('Error importing excel:', error);
      alert('Có lỗi xảy ra khi nhập dữ liệu từ Excel.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleDownloadTemplate = () => {
    const template = [
      {
        'Email': 'student1@example.com',
        'Họ và tên': 'Nguyễn Văn A',
        'Trường': 'THPT Chuyên Hà Nội',
        'Lớp': '12A1',
        'Vai trò': 'student'
      },
      {
        'Email': 'teacher1@example.com',
        'Họ và tên': 'Trần Thị B',
        'Trường': 'THPT Chuyên Hà Nội',
        'Lớp': 'Toán',
        'Vai trò': 'teacher'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "mau_import_thanh_vien.xlsx");
  };

  const handleResetPassword = async (email: string) => {
    if (currentUser.role !== 'admin') {
      alert('Chỉ quản trị viên mới có quyền reset mật khẩu.');
      return;
    }
    
    if (window.confirm(`Gửi email khôi phục mật khẩu đến ${email}?`)) {
      try {
        await sendPasswordReset(email);
        alert('Đã gửi email khôi phục mật khẩu thành công.');
      } catch (error) {
        console.error('Error resetting password:', error);
        alert('Có lỗi xảy ra khi gửi email khôi phục mật khẩu.');
      }
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword || !newUsername) return;

    setSaving(true);
    try {
      const emailUnique = await checkEmailUnique(newEmail);
      if (!emailUnique) {
        alert('Email này đã tồn tại trong hệ thống.');
        return;
      }

      const usernameUnique = await checkUsernameUnique(newUsername);
      if (!usernameUnique) {
        alert('Tên đăng nhập này đã tồn tại.');
        return;
      }

      await signUpWithEmail(newEmail, newPassword, newDisplayName, newUsername, newSchool, newClass);
      
      setNewEmail('');
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewSchool('');
      setNewClass('');
      setIsAdding(false);
    } catch (error: any) {
      console.error('Error adding user:', error);
      alert(error.message || 'Có lỗi xảy ra khi thêm người dùng.');
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
    if (currentUser.role !== 'admin') {
      alert('Chỉ quản trị viên mới có quyền xóa tài khoản.');
      return;
    }
    if (window.confirm('Bạn có chắc chắn muốn xóa người dùng này?')) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        setSelectedUsers(prev => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Có lỗi xảy ra khi xóa người dùng.');
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (currentUser.role !== 'admin') {
      alert('Chỉ quản trị viên mới có quyền xóa tài khoản.');
      return;
    }
    if (selectedUsers.size === 0) return;
    
    if (window.confirm(`Bạn có chắc chắn muốn xóa ${selectedUsers.size} người dùng đã chọn?`)) {
      setSaving(true);
      const total = selectedUsers.size;
      let current = 0;
      setDeleteProgress({ current, total });
      
      try {
        for (const uid of selectedUsers) {
          if (uid !== currentUser.uid) {
            await deleteDoc(doc(db, 'users', uid));
            current++;
            setDeleteProgress({ current, total });
          }
        }
        setSelectedUsers(new Set());
        alert('Đã xóa thành công.');
      } catch (error) {
        console.error('Error deleting users:', error);
        alert('Có lỗi xảy ra khi xóa người dùng.');
      } finally {
        setSaving(false);
        setDeleteProgress(null);
      }
    }
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.uid)));
    }
  };

  const toggleSelectUser = (uid: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const handleSort = (field: keyof User) => {
    setSortBy(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredUsers = users
    .filter(u => {
      const matchesSearch = u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           u.username?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSchool = !filterSchool || u.school?.toLowerCase().includes(filterSchool.toLowerCase());
      const matchesClass = !filterClass || u.class?.toLowerCase().includes(filterClass.toLowerCase());
      return matchesSearch && matchesSchool && matchesClass;
    })
    .sort((a, b) => {
      const aVal = a[sortBy.field] || '';
      const bVal = b[sortBy.field] || '';
      if (aVal < bVal) return sortBy.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortBy.direction === 'asc' ? 1 : -1;
      return 0;
    });

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
        
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-700 py-3 px-6 rounded-xl hover:bg-stone-50 transition-all font-medium"
          >
            <Download className="w-5 h-5" />
            Tải mẫu Excel
          </button>
          <label className="flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-700 py-3 px-6 rounded-xl hover:bg-stone-50 transition-all font-medium cursor-pointer">
            {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
            Nhập từ Excel
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} disabled={importing} />
          </label>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-all font-medium shadow-lg shadow-stone-200"
          >
            <UserPlus className="w-5 h-5" />
            Thêm thành viên mới
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                placeholder="Tìm kiếm theo email, tên hoặc tên đăng nhập..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all text-sm"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-1.5">
                <School className="w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Lọc theo trường..."
                  value={filterSchool}
                  onChange={(e) => setFilterSchool(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 text-sm w-32"
                />
              </div>
              <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-1.5">
                <BookOpen className="w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Lọc theo lớp..."
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 text-sm w-32"
                />
              </div>
              
              <div className="flex items-center gap-2 text-xs font-medium text-stone-400 uppercase tracking-wider ml-auto lg:ml-0">
                <Users className="w-4 h-4" /> Tổng số: {users.length}
              </div>
            </div>
          </div>
          
          {selectedUsers.size > 0 && currentUser.role === 'admin' && (
            <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-stone-200 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-900">Đã chọn {selectedUsers.size} thành viên</p>
                  {deleteProgress && (
                    <p className="text-xs text-stone-500">Đang xóa: {deleteProgress.current}/{deleteProgress.total}</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleDeleteSelected}
                disabled={saving}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xác nhận xóa
              </button>
            </div>
          )}
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
                  <th className="px-6 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                    />
                  </th>
                  <th 
                    className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider cursor-pointer hover:text-stone-900"
                    onClick={() => handleSort('displayName')}
                  >
                    <div className="flex items-center gap-1">
                      Thành viên
                      {sortBy.field === 'displayName' && (sortBy.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider cursor-pointer hover:text-stone-900"
                    onClick={() => handleSort('school')}
                  >
                    <div className="flex items-center gap-1">
                      Trường / Lớp
                      {sortBy.field === 'school' && (sortBy.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Vai trò</th>
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Phê duyệt</th>
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Trạng thái</th>
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className={cn("hover:bg-stone-50/30 transition-colors", selectedUsers.has(user.uid) && "bg-stone-50")}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.uid)}
                        onChange={() => toggleSelectUser(user.uid)}
                        className="rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-stone-500 font-medium">
                          {user.displayName?.[0] || user.email[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-stone-900">{user.displayName || 'Chưa cập nhật'}</div>
                          <div className="text-xs text-stone-400">{user.username || user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-stone-600">{user.school || '-'}</div>
                      <div className="text-xs text-stone-400">{user.class || '-'}</div>
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
                      <div className="flex items-center justify-end gap-2">
                        {currentUser.role === 'admin' && !user.uid.startsWith('pre_') && (
                          <button
                            onClick={() => handleResetPassword(user.email)}
                            title="Reset mật khẩu"
                            className="p-2 text-stone-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleEditUser(user)}
                          className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.uid)}
                          disabled={user.uid === currentUser.uid || currentUser.role !== 'admin'}
                          className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => !saving && setEditingUser(null)} />
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <h2 className="text-xl font-serif italic font-medium">Chỉnh sửa thông tin</h2>
              <button onClick={() => setEditingUser(null)} className="p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="p-8 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <UserCircle className="w-4 h-4" /> Họ và tên
                </label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                  placeholder="Nhập họ và tên"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <UserCircle className="w-4 h-4" /> Tên đăng nhập
                </label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                  placeholder="Nhập tên đăng nhập"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <School className="w-4 h-4" /> Trường học
                </label>
                <input
                  type="text"
                  value={editForm.school}
                  onChange={(e) => setEditForm({ ...editForm, school: e.target.value })}
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
                  value={editForm.class}
                  onChange={(e) => setEditForm({ ...editForm, class: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                  placeholder="Nhập tên lớp"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
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
      )}

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
            <form onSubmit={handleAddUser} className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                    <UserCircle className="w-4 h-4" /> Họ và tên
                  </label>
                  <input
                    type="text"
                    required
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                    <UserCircle className="w-4 h-4" /> Tên đăng nhập
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                    placeholder="username123"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email
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
                    <Key className="w-4 h-4" /> Mật khẩu ban đầu
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                    <School className="w-4 h-4" /> Trường học
                  </label>
                  <input
                    type="text"
                    value={newSchool}
                    onChange={(e) => setNewSchool(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                    placeholder="Tên trường"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> Lớp học
                  </label>
                  <input
                    type="text"
                    value={newClass}
                    onChange={(e) => setNewClass(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                    placeholder="Tên lớp"
                  />
                </div>
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
