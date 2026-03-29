import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy bỏ',
  onConfirm,
  onCancel,
  variant = 'danger',
  loading = false
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: <AlertCircle className="w-8 h-8 text-red-600" />,
      bg: 'bg-red-100',
      button: 'bg-red-600 hover:bg-red-700 shadow-red-200',
      border: 'border-red-100'
    },
    warning: {
      icon: <AlertCircle className="w-8 h-8 text-amber-600" />,
      bg: 'bg-amber-100',
      button: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200',
      border: 'border-amber-100'
    },
    info: {
      icon: <AlertCircle className="w-8 h-8 text-blue-600" />,
      bg: 'bg-blue-100',
      button: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
      border: 'border-blue-100'
    }
  };

  const style = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onCancel} />
      <div className={cn(
        "relative bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border animate-in zoom-in-95 duration-200",
        style.border
      )}>
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6", style.bg)}>
          {style.icon}
        </div>
        
        <h3 className="text-2xl font-bold text-stone-900 text-center mb-2">{title}</h3>
        <p className="text-stone-600 text-center mb-8 leading-relaxed">
          {message}
        </p>
        
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="py-3 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition-all disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "text-white py-3 rounded-xl font-bold transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2",
              style.button
            )}
          >
            {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
