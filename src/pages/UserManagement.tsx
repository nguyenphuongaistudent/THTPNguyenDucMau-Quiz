import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, setDoc, doc, deleteDoc, serverTimestamp, addDoc, where, getDocs, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { User, UserRole } from '../types';
import * as XLSX from 'xlsx';
import { Users, UserPlus, Trash2, Shield, GraduationCap, UserCircle, Star, Loader2, Search, Mail, CheckCircle, XCircle, Clock, Edit2, School, BookOpen, Save, FileDown, FileUp, Key, Download, ChevronUp, ChevronDown, Filter, X, RefreshCw } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { motion } from 'motion/react';
import { sendPasswordReset, signUpWithEmail, checkUsernameUnique, checkEmailUnique } from '../firebase';
import { toast } from 'sonner';

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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [isResettingEmail, setIsResettingEmail] = useState(false);
  const [isGeneratingPass, setIsGeneratingPass] = useState(false);
  
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newSchool, setNewSchool] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('student');
  const [editForm, setEditForm] = useState({ 
    displayName: '', 
    school: '', 
    class: '', 
    username: '',
    email: '',
    role: 'student' as UserRole,
    isApproved: true
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [regEnabled, setRegEnabled] = useState(true);
  const [updatingReg, setUpdatingReg] = useState(false);

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'registration');
    const unsubscribe = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        setRegEnabled(doc.data().enabled ?? true);
      }
    }, (error) => {
      console.error("Error listening to settings:", error);
    });
    return () => unsubscribe();
  }, []);

  const toggleRegistration = async () => {
    if (currentUser.role !== 'admin') return;
    setUpdatingReg(true);
    try {
      await updateDoc(doc(db, 'settings', 'registration'), {
        enabled: !regEnabled,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });
      toast.success(regEnabled ? 'Đã tắt chức năng đăng ký' : 'Đã bật chức năng đăng ký');
    } catch (error) {
      console.error('Error updating registration setting:', error);
      toast.error('Không thể cập nhật cấu hình đăng ký.');
    } finally {
      setUpdatingReg(false);
    }
  };

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
      username: user.username || '',
      email: user.email || '',
      role: user.role || 'student',
      isApproved: user.isApproved ?? true
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
      toast.success('Cập nhật thông tin thành công.');
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Có lỗi xảy ra khi cập nhật thông tin.');
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
        let missingInfo = 0;
        let alreadyExists = 0;

        for (const row of data) {
          // Normalize keys: trim and lowercase
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            normalizedRow[key.trim().toLowerCase()] = row[key];
          });

          const email = (
            normalizedRow['email'] || 
            normalizedRow['email address'] || 
            normalizedRow['địa chỉ email'] || 
            ''
          ).toString().trim().toLowerCase();

          const displayName = (
            normalizedRow['họ và tên'] || 
            normalizedRow['tên'] || 
            normalizedRow['display name'] || 
            normalizedRow['name'] || 
            ''
          ).toString().trim();

          const username = (
            normalizedRow['tên đăng nhập'] || 
            normalizedRow['username'] || 
            (email ? email.split('@')[0] : '')
          ).toString().trim().toLowerCase();

          const password = (
            normalizedRow['mật khẩu'] || 
            normalizedRow['password'] || 
            '123456'
          ).toString().trim();

          const school = (
            normalizedRow['trường'] || 
            normalizedRow['school'] || 
            'Trường Tự do'
          ).toString().trim();

          const className = (
            normalizedRow['lớp'] || 
            normalizedRow['class'] || 
            'Tự do'
          ).toString().trim();

          let role = (
            normalizedRow['vai trò'] || 
            normalizedRow['role'] || 
            'student'
          ).toString().trim().toLowerCase() as UserRole;

          // Restrict roles for non-admin users
          if (currentUser.role !== 'admin' && (role === 'admin' || role === 'teacher' || role === 'student-vip')) {
            role = 'student';
          }
          
          if (email && displayName) {
            // Check if email or username already exists
            const emailUnique = await checkEmailUnique(email);
            const usernameUnique = await checkUsernameUnique(username);
            
            if (emailUnique && usernameUnique) {
              const uid = `pre_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await setDoc(doc(db, 'users', uid), {
                email: email,
                username: username,
                password: password, // Store password for initial login
                displayName: displayName,
                school: school,
                class: className,
                role: role,
                isApproved: true,
                createdAt: serverTimestamp(),
                uid: uid
              });
              count++;
            } else {
              // Update existing user to ensure data consistency (casing, password for login)
              let existingUid = '';
              const usersRef = collection(db, 'users');
              const qEmail = query(usersRef, where('email', '==', email));
              const emailSnap = await getDocs(qEmail);
              
              if (!emailSnap.empty) {
                existingUid = emailSnap.docs[0].id;
              } else {
                const qUser = query(usersRef, where('username', '==', username));
                const userSnap = await getDocs(qUser);
                if (!userSnap.empty) {
                  existingUid = userSnap.docs[0].id;
                }
              }

              if (existingUid) {
                await updateDoc(doc(db, 'users', existingUid), {
                  email: email,
                  username: username,
                  password: password,
                  displayName: displayName,
                  school: school,
                  class: className,
                  role: role,
                  updatedAt: serverTimestamp()
                });
                count++;
              } else {
                alreadyExists++;
                skipped++;
              }
            }
          } else {
            missingInfo++;
            skipped++;
          }
        }
        
        let message = `Đã nhập thành công ${count} thành viên.`;
        if (alreadyExists > 0) message += `\n- Bỏ qua ${alreadyExists} thành viên đã tồn tại.`;
        if (missingInfo > 0) message += `\n- Bỏ qua ${missingInfo} dòng thiếu thông tin bắt buộc (Email, Họ và tên).`;
        
        toast.success(message);
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error('Error importing excel:', error);
      toast.error('Có lỗi xảy ra khi nhập dữ liệu từ Excel.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleDownloadTemplate = () => {
    const template = [
      {
        'Email': 'student1@example.com',
        'Tên đăng nhập': 'student1',
        'Mật khẩu': '123456',
        'Họ và tên': 'Nguyễn Văn A',
        'Trường': 'THPT Chuyên Hà Nội',
        'Lớp': '12A1',
        'Vai trò': 'student'
      },
      {
        'Email': 'teacher1@example.com',
        'Tên đăng nhập': 'teacher1',
        'Mật khẩu': '123456',
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

  const handleResetPassword = async (user: User) => {
    if (currentUser.role !== 'admin') {
      toast.error('Chỉ quản trị viên mới có quyền reset mật khẩu.');
      return;
    }
    setResettingUser(user);
    setTempPassword(null);
  };

  const handleSendResetEmail = async () => {
    if (!resettingUser) return;
    setIsResettingEmail(true);
    try {
      await sendPasswordReset(resettingUser.email);
      toast.success('Đã gửi email khôi phục mật khẩu thành công.');
      setResettingUser(null);
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error('Có lỗi xảy ra khi gửi email khôi phục mật khẩu.');
    } finally {
      setIsResettingEmail(false);
    }
  };

  const handleGenerateTempPassword = async () => {
    if (!resettingUser) return;
    setIsGeneratingPass(true);
    try {
      const newPass = Math.random().toString(36).slice(-8);
      await updateDoc(doc(db, 'users', resettingUser.uid), {
        password: newPass,
        updatedAt: serverTimestamp()
      });
      setTempPassword(newPass);
      toast.success('Đã tạo mật khẩu tạm thời mới');
    } catch (error) {
      console.error('Error generating temp password:', error);
      toast.error('Lỗi khi tạo mật khẩu mới');
    } finally {
      setIsGeneratingPass(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword || !newUsername || !newDisplayName) {
      toast.error('Vui lòng điền đầy đủ các thông tin bắt buộc (Email, Tên đăng nhập, Mật khẩu, Họ và tên).');
      return;
    }

    setSaving(true);
    try {
      const emailUnique = await checkEmailUnique(newEmail);
      if (!emailUnique) {
        toast.error('Email này đã tồn tại trong hệ thống.');
        setSaving(false);
        return;
      }

      const usernameUnique = await checkUsernameUnique(newUsername);
      if (!usernameUnique) {
        toast.error('Tên đăng nhập này đã tồn tại.');
        setSaving(false);
        return;
      }

      const finalSchool = newSchool.trim() || 'Trường Tự do';
      const finalClass = newClass.trim() || 'Tự do';

      // Create a pre-assigned user document in Firestore
      // This allows the user to log in with the password without immediate Auth creation/verification
      const uid = `pre_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await setDoc(doc(db, 'users', uid), {
        uid: uid,
        email: newEmail.trim().toLowerCase(),
        username: newUsername.trim().toLowerCase(),
        password: newPassword, // Store password for first login
        displayName: newDisplayName.trim(),
        school: finalSchool,
        class: finalClass,
        role: newRole,
        isApproved: true,
        createdAt: serverTimestamp(),
      });
      
      setNewEmail('');
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewSchool('');
      setNewClass('');
      setNewRole('student');
      setIsAdding(false);
      toast.success('Đã cấp tài khoản thành công. Thành viên có thể đăng nhập bằng tên đăng nhập và mật khẩu đã tạo.');
    } catch (error: any) {
      console.error('Error adding user:', error);
      toast.error(error.message || 'Có lỗi xảy ra khi cấp tài khoản.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRole = async (uid: string, role: UserRole) => {
    if (currentUser.role !== 'admin' && (role === 'admin' || role === 'teacher' || role === 'student-vip')) {
      toast.error('Chỉ quản trị viên mới có thể cấp quyền này.');
      return;
    }
    try {
      await setDoc(doc(db, 'users', uid), { role }, { merge: true });
      toast.success('Cập nhật vai trò thành công.');
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Có lỗi xảy ra khi cập nhật vai trò.');
    }
  };

  const handleToggleApproval = async (uid: string, currentStatus: boolean) => {
    try {
      await setDoc(doc(db, 'users', uid), { isApproved: !currentStatus }, { merge: true });
      toast.success(currentStatus ? 'Đã hủy phê duyệt.' : 'Đã phê duyệt thành viên.');
    } catch (error) {
      console.error('Error toggling approval:', error);
      toast.error('Có lỗi xảy ra khi cập nhật trạng thái phê duyệt.');
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (currentUser.role !== 'admin') {
      toast.error('Chỉ quản trị viên mới có quyền xóa tài khoản.');
      return;
    }
    if (!window.confirm('Bạn có chắc chắn muốn xóa người dùng này?')) return;
    
    try {
      await deleteDoc(doc(db, 'users', uid));
      setSelectedUsers(prev => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
      toast.success('Đã xóa người dùng thành công.');
    } catch (error) {
      console.error('Error deleting user:', error);
      handleFirestoreError(error, OperationType.DELETE, 'users');
      toast.error('Có lỗi xảy ra khi xóa người dùng.');
    }
  };

  const handleDeleteSelected = async () => {
    if (currentUser.role !== 'admin') {
      toast.error('Chỉ quản trị viên mới có quyền xóa tài khoản.');
      return;
    }
    if (selectedUsers.size === 0) return;
    
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedUsers.size} người dùng đã chọn?`)) return;
    
    setSaving(true);
    const total = selectedUsers.size;
    let current = 0;
    setDeleteProgress({ current, total });
    
    try {
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      for (const uid of selectedUsers) {
        if (uid !== currentUser.uid) {
          batch.delete(doc(db, 'users', uid));
          current++;
          setDeleteProgress({ current, total });
        }
      }
      
      await batch.commit();
      setSelectedUsers(new Set());
      toast.success(`Đã xóa thành công ${current} người dùng.`);
    } catch (error) {
      console.error('Error deleting users:', error);
      handleFirestoreError(error, OperationType.DELETE, 'users');
      toast.error('Có lỗi xảy ra khi xóa người dùng.');
    } finally {
      setSaving(false);
      setDeleteProgress(null);
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
    setCurrentPage(1);
  };

  const filteredUsers = users
    .filter(u => {
      const matchesSearch = u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           u.username?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSchool = !filterSchool || u.school === filterSchool;
      const matchesClass = !filterClass || u.class === filterClass;
      return matchesSearch && matchesSchool && matchesClass;
    })
    .sort((a, b) => {
      const aVal = a[sortBy.field] || '';
      const bVal = b[sortBy.field] || '';
      if (aVal < bVal) return sortBy.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortBy.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const uniqueSchools = Array.from(new Set(users.map(u => u.school).filter(Boolean))).sort();
  const uniqueClasses = Array.from(new Set(
    users
      .filter(u => !filterSchool || u.school === filterSchool)
      .map(u => u.class)
      .filter(Boolean)
  )).sort();

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4 text-red-500" />;
      case 'teacher': return <GraduationCap className="w-4 h-4 text-emerald-500" />;
      case 'student': return <UserCircle className="w-4 h-4 text-stone-500" />;
      case 'student-vip': return <Star className="w-4 h-4 text-amber-500" />;
      case 'guest': return <Users className="w-4 h-4 text-stone-400" />;
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'Quản trị viên';
      case 'teacher': return 'Giáo viên';
      case 'student': return 'Học sinh';
      case 'student-vip': return 'Học sinh-VIP';
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
            className="flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-700 py-2 px-4 rounded-lg hover:bg-stone-50 transition-all font-medium text-sm"
          >
            <Download className="w-4 h-4" />
            Tải mẫu Excel
          </button>
          <label className="flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-700 py-2 px-4 rounded-lg hover:bg-stone-50 transition-all font-medium text-sm cursor-pointer">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Nhập từ Excel
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} disabled={importing} />
          </label>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 bg-stone-900 text-white py-2 px-4 rounded-lg hover:bg-stone-800 transition-all font-medium text-sm shadow-lg shadow-stone-200"
          >
            <UserPlus className="w-4 h-4" />
            Thêm thành viên mới
          </button>
          
          {currentUser.role === 'admin' && (
            <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-stone-200 shadow-sm">
              <span className="text-xs font-medium text-stone-600">Cho phép đăng ký:</span>
              <button
                onClick={toggleRegistration}
                disabled={updatingReg}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                  regEnabled ? "bg-emerald-500" : "bg-stone-300"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    regEnabled ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          )}
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
                <select
                  value={filterSchool}
                  onChange={(e) => { setFilterSchool(e.target.value); setCurrentPage(1); }}
                  className="bg-transparent border-none focus:ring-0 text-sm min-w-[120px]"
                >
                  <option value="">Tất cả trường</option>
                  {uniqueSchools.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-1.5">
                <BookOpen className="w-4 h-4 text-stone-400" />
                <select
                  value={filterClass}
                  onChange={(e) => { setFilterClass(e.target.value); setCurrentPage(1); }}
                  className="bg-transparent border-none focus:ring-0 text-sm min-w-[120px]"
                >
                  <option value="">Tất cả lớp</option>
                  {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              
              <div className="flex items-center gap-2 text-xs font-medium text-stone-400 uppercase tracking-wider ml-auto lg:ml-0">
                <Users className="w-4 h-4" /> Hiển thị: {paginatedUsers.length}/{filteredUsers.length}
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
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Lịch sử truy cập</th>
                  <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {paginatedUsers.map((user) => (
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
                        {currentUser.role === 'admin' && (
                          <>
                            <option value="student-vip">Học sinh-VIP</option>
                            <option value="teacher">Giáo viên</option>
                          </>
                        )}
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
                    <td className="px-6 py-4">
                      <div className="text-xs text-stone-500">
                        {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Chưa từng'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {currentUser.role === 'admin' && (
                          <button
                            onClick={() => handleResetPassword(user)}
                            title="Khôi phục mật khẩu"
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

        {/* Pagination Controls */}
        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 bg-stone-50/50 border-t border-stone-100 flex items-center justify-between">
            <p className="text-sm text-stone-500">
              Trang <span className="font-medium text-stone-900">{currentPage}</span> / {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                Trước
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-all",
                        currentPage === pageNum 
                          ? "bg-stone-900 text-white shadow-md" 
                          : "text-stone-600 hover:bg-stone-100"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                Sau
              </button>
            </div>
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
            <form onSubmit={handleUpdateUser} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto">
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
              <div className="grid grid-cols-2 gap-4">
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
                    <Mail className="w-4 h-4" /> Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                    placeholder="Nhập email"
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Vai trò
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                  >
                    <option value="student">Học sinh</option>
                    <option value="student-vip">Học sinh-VIP</option>
                    <option value="teacher">Giáo viên</option>
                    <option value="admin">Quản trị viên</option>
                    <option value="guest">Khách</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Trạng thái
                  </label>
                  <select
                    value={editForm.isApproved ? 'true' : 'false'}
                    onChange={(e) => setEditForm({ ...editForm, isApproved: e.target.value === 'true' })}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-500 transition-all"
                  >
                    <option value="true">Đã phê duyệt</option>
                    <option value="false">Chờ phê duyệt</option>
                  </select>
                </div>
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
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['guest', 'student', 'student-vip', 'teacher', 'admin'] as UserRole[])
                    .filter(role => {
                      if (currentUser.role === 'admin') return true;
                      // Teachers can only create students or guests
                      return role === 'student' || role === 'guest';
                    })
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
      {/* Password Reset Modal */}
      {resettingUser && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => !isResettingEmail && !isGeneratingPass && setResettingUser(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <h3 className="text-xl font-serif italic font-medium text-stone-900">Khôi phục mật khẩu</h3>
              <button onClick={() => setResettingUser(null)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="flex items-start gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <div className="w-12 h-12 rounded-full bg-stone-200 flex items-center justify-center flex-shrink-0">
                  <UserCircle className="w-6 h-6 text-stone-600" />
                </div>
                <div>
                  <p className="font-medium text-stone-900">{resettingUser.displayName || resettingUser.username}</p>
                  <p className="text-sm text-stone-500">{resettingUser.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={handleSendResetEmail}
                  disabled={isResettingEmail || isGeneratingPass}
                  className="flex items-center justify-center gap-2 w-full px-4 py-4 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 disabled:opacity-50 transition-all shadow-lg shadow-stone-200"
                >
                  {isResettingEmail ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Mail className="w-5 h-5" />
                  )}
                  Gửi email khôi phục mật khẩu
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-100"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest">
                    <span className="bg-white px-3 text-stone-400">Hoặc</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={handleGenerateTempPassword}
                    disabled={isGeneratingPass || isResettingEmail}
                    className="flex items-center justify-center gap-2 w-full px-4 py-4 bg-white border border-stone-200 text-stone-900 rounded-2xl font-medium hover:bg-stone-50 disabled:opacity-50 transition-all"
                  >
                    {isGeneratingPass ? (
                      <Loader2 className="w-5 h-5 animate-spin text-stone-900" />
                    ) : (
                      <RefreshCw className="w-5 h-5" />
                    )}
                    Hiển thị mật khẩu tạm thời mới
                  </button>

                  {tempPassword && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-6 bg-amber-50 border border-amber-100 rounded-2xl text-center shadow-inner"
                    >
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">Mật khẩu mới của thành viên</p>
                      <p className="text-3xl font-mono font-bold text-amber-900 tracking-[0.2em]">{tempPassword}</p>
                      <div className="mt-4 p-3 bg-white/50 rounded-xl">
                        <p className="text-[10px] leading-relaxed text-amber-700 font-medium">
                          Hãy cung cấp mật khẩu này cho thành viên. <br/>
                          Hệ thống sẽ ghi nhận mật khẩu này khi họ đăng nhập bằng Tên đăng nhập.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-8 py-6 bg-stone-50 border-t border-stone-100 flex justify-end">
              <button
                onClick={() => setResettingUser(null)}
                className="px-6 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
              >
                Đóng
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
