import React, { useState, useRef } from 'react';
import { X, Upload, FileJson, FileText, AlertCircle, Loader2, CheckCircle2, Download } from 'lucide-react';
import { parseJSON, parseWord, ImportedQuiz, downloadFile, generateSampleJSON, generateSampleWordContent } from '../lib/importUtils';
import { cn } from '../lib/utils';

interface ImportQuizModalProps {
  onClose: () => void;
  onImport: (quiz: ImportedQuiz) => void;
}

export default function ImportQuizModal({ onClose, onImport }: ImportQuizModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ImportedQuiz | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setSuccess(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let imported: ImportedQuiz;

      if (extension === 'json') {
        const text = await file.text();
        imported = parseJSON(text);
      } else if (extension === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        imported = await parseWord(arrayBuffer);
      } else if (extension === 'doc') {
        throw new Error('Định dạng .doc không được hỗ trợ. Vui lòng lưu file dưới dạng .docx (Word 2007+) và thử lại.');
      } else {
        throw new Error('Định dạng file không được hỗ trợ. Vui lòng chọn .json hoặc .docx');
      }

      if (imported.questions.length === 0) {
        throw new Error('Không tìm thấy câu hỏi nào trong file. Vui lòng đảm bảo câu hỏi bắt đầu bằng số (ví dụ: "1." hoặc "Câu 1.") và các phương án bắt đầu bằng chữ cái (ví dụ: "A.").');
      }

      setSuccess(imported);
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi nhập file.');
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = () => {
    if (success) {
      onImport(success);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <h2 className="text-2xl font-serif italic font-medium">Nhập đề thi</h2>
          <button 
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {!success ? (
            <>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all",
                  file ? "border-emerald-500 bg-emerald-50/50" : "border-stone-200 hover:border-emerald-400 hover:bg-stone-50"
                )}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".json,.docx" 
                  className="hidden" 
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center text-stone-400">
                    {file ? (
                      file.name.endsWith('.json') ? <FileJson className="w-8 h-8 text-emerald-600" /> : <FileText className="w-8 h-8 text-emerald-600" />
                    ) : (
                      <Upload className="w-8 h-8" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900 break-normal">
                      {file ? file.name : 'Nhấn để chọn file hoặc kéo thả'}
                    </p>
                    <p className="text-xs text-stone-400 mt-1">Hỗ trợ định dạng .json và .docx</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="bg-stone-50 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Tải file mẫu:</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => downloadFile(generateSampleJSON(), 'sample_quiz.json', 'application/json')}
                      className="text-[10px] flex items-center gap-1 bg-white border border-stone-200 px-2 py-1 rounded hover:bg-stone-100 transition-colors text-stone-600"
                    >
                      <Download className="w-3 h-3" /> JSON
                    </button>
                    <button 
                      onClick={() => downloadFile(generateSampleWordContent(), 'sample_quiz.txt', 'text/plain')}
                      className="text-[10px] flex items-center gap-1 bg-white border border-stone-200 px-2 py-1 rounded hover:bg-stone-100 transition-colors text-stone-600"
                    >
                      <Download className="w-3 h-3" /> Word (Text)
                    </button>
                  </div>
                </div>
                <ul className="text-xs text-stone-500 space-y-1 list-disc ml-4">
                  <li>Title: Tên bài thi</li>
                  <li>Subject: Môn học</li>
                  <li>Topic: regular/periodic/graduation</li>
                  <li>Duration: 45</li>
                  <li>--- (Dấu ngăn cách - Tùy chọn)</li>
                  <li>1. (hoặc Câu 1.) Nội dung câu hỏi?</li>
                  <li>A. Lựa chọn 1</li>
                  <li>B. Lựa chọn 2...</li>
                  <li>Answer: A</li>
                </ul>
              </div>

              <button
                disabled={!file || loading}
                onClick={handleImport}
                className="w-full bg-stone-900 text-white py-3 rounded-xl hover:bg-stone-800 transition-all font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                Tải lên và phân tích
              </button>
            </>
          ) : (
            <div className="space-y-6 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-medium text-stone-900">Phân tích thành công!</h3>
                <p className="text-stone-500 mt-2 break-normal">
                  Tìm thấy <strong>{success.questions.length}</strong> câu hỏi trong bài thi <strong className="break-normal">"{success.title}"</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="p-3 bg-stone-50 rounded-lg">
                  <p className="text-[10px] font-bold text-stone-400 uppercase">Môn học</p>
                  <p className="text-sm font-medium">{success.subject}</p>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg">
                  <p className="text-[10px] font-bold text-stone-400 uppercase">Thời gian</p>
                  <p className="text-sm font-medium">{success.duration} phút</p>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setSuccess(null)}
                  className="flex-1 py-3 text-stone-500 font-medium hover:text-stone-900 transition-colors"
                >
                  Chọn file khác
                </button>
                <button
                  onClick={confirmImport}
                  className="flex-1 bg-emerald-600 text-white py-3 rounded-xl hover:bg-emerald-700 transition-all font-medium shadow-lg shadow-emerald-200"
                >
                  Xác nhận nhập
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
