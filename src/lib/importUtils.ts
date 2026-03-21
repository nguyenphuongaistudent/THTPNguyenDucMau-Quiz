import * as mammoth from 'mammoth';
import { Question, QuestionType, QuizTopic } from '../types';

export interface ImportedQuiz {
  title: string;
  description: string;
  subject: string;
  topic: QuizTopic;
  duration: number;
  questions: Partial<Question>[];
}

export const parseJSON = (content: string): ImportedQuiz => {
  try {
    const data = JSON.parse(content);
    // Basic validation
    if (!data.title || !Array.isArray(data.questions)) {
      throw new Error('Định dạng JSON không hợp lệ. Cần có "title" và "questions".');
    }
    return {
      ...data,
      questions: data.questions.map((q: any, index: number) => ({
        ...q,
        order: q.order !== undefined ? q.order : index
      }))
    } as ImportedQuiz;
  } catch (error: any) {
    throw new Error('Lỗi khi đọc file JSON: ' + error.message);
  }
};

export const parseWord = async (arrayBuffer: ArrayBuffer): Promise<ImportedQuiz> => {
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;
    
    // Simple parsing logic for HTML from Word
    // We'll strip some tags but keep basic formatting
    // This is a bit complex because mammoth output is HTML
    // For now, let's stick to a simpler text-based parsing but allow HTML in the content
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const text = tempDiv.innerText || tempDiv.textContent || '';
    
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    
    let title = 'Bài thi mới (Imported)';
    let subject = 'Toán';
    let topic: QuizTopic = 'regular';
    let duration = 30;
    let questions: Partial<Question>[] = [];
    
    let currentQuestion: Partial<Question> | null = null;
    let parsingQuestions = false;
    let currentType: QuestionType = 'multiple_choice';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.toLowerCase().startsWith('title:')) {
        title = line.substring(6).trim();
        continue;
      }
      if (line.toLowerCase().startsWith('subject:')) {
        subject = line.substring(8).trim();
        continue;
      }
      if (line.toLowerCase().startsWith('topic:')) {
        const t = line.substring(6).trim().toLowerCase();
        if (['regular', 'periodic', 'graduation'].includes(t)) {
          topic = t as QuizTopic;
        }
        continue;
      }
      if (line.toLowerCase().startsWith('duration:')) {
        duration = parseInt(line.substring(9).trim()) || 30;
        continue;
      }
      
      if (line.toLowerCase().startsWith('type:')) {
        const t = line.substring(5).trim().toLowerCase();
        if (t === 'true_false' || t === 'multiple_choice') {
          currentType = t as QuestionType;
        }
        continue;
      }

      if (line === '---' || line.startsWith('===')) {
        parsingQuestions = true;
        continue;
      }

      if (parsingQuestions) {
        // Detect new question (starts with number like "1." or "Câu 1:")
        const questionMatch = line.match(/^(\d+[\.\:]|Câu \d+[\.\:])/i);
        if (questionMatch) {
          if (currentQuestion) questions.push(currentQuestion);
          currentQuestion = {
            type: currentType,
            text: line.replace(questionMatch[0], '').trim(),
            options: [],
            correctOptionIndex: currentType === 'multiple_choice' ? 0 : undefined,
            correctAnswers: currentType === 'true_false' ? [] : undefined,
            explanation: '',
            order: questions.length
          };
          continue;
        }

        // Detect options (A., B., C., D. for multiple_choice OR a., b., c., d. for true_false)
        const optionMatch = line.match(/^([A-D]|[a-d])[\.\)]/i);
        if (optionMatch && currentQuestion) {
          const optText = line.replace(optionMatch[0], '').trim();
          if (!currentQuestion.options) currentQuestion.options = [];
          currentQuestion.options.push(optText);
          continue;
        }

        // Detect answer
        const answerMatch = line.match(/^(Answer|Đáp án)[\.\:]\s*(.*)/i);
        if (answerMatch && currentQuestion) {
          const ansContent = answerMatch[2].trim();
          
          if (currentQuestion.type === 'multiple_choice') {
            const ansChar = ansContent.charAt(0).toUpperCase();
            currentQuestion.correctOptionIndex = ansChar.charCodeAt(0) - 65; // A=0, B=1, ...
          } else {
            // True/False answer format: "Đúng, Sai, Sai, Đúng" or "T, F, F, T"
            const parts = ansContent.split(/[\,\s]+/).map(p => p.toLowerCase());
            currentQuestion.correctAnswers = parts.map(p => 
              p === 'đúng' || p === 't' || p === 'true' || p === 'd'
            );
          }
          continue;
        }
        
        // If it's just text and we have a current question, append to text or explanation
        if (currentQuestion && !line.match(/^(Answer|Đáp án|Title|Subject|Topic|Duration)/i)) {
          if (currentQuestion.options && currentQuestion.options.length > 0) {
            // Probably explanation or continuation of last option
            // For simplicity, we'll just ignore for now or append to explanation
            currentQuestion.explanation = (currentQuestion.explanation || '') + ' ' + line;
          } else {
            currentQuestion.text = (currentQuestion.text || '') + ' ' + line;
          }
        }
      }
    }
    
    if (currentQuestion) questions.push(currentQuestion);

    return {
      title,
      description: 'Được nhập từ file Word',
      subject,
      topic,
      duration,
      questions
    };
  } catch (error: any) {
    throw new Error('Lỗi khi đọc file Word: ' + error.message);
  }
};

export const downloadFile = (content: string, fileName: string, contentType: string) => {
  const a = document.createElement('a');
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const generateSampleJSON = () => {
  const sample: ImportedQuiz = {
    title: "Đề thi mẫu tổng hợp",
    description: "Mô tả bài thi mẫu bao gồm nhiều loại câu hỏi",
    subject: "Toán",
    topic: "regular",
    duration: 45,
    questions: [
      {
        type: "multiple_choice",
        text: "1 + 1 bằng mấy?",
        options: ["1", "2", "3", "4"],
        correctOptionIndex: 1,
        explanation: "Phép cộng cơ bản."
      },
      {
        type: "true_false",
        text: "Xét các mệnh đề sau về số nguyên tố:",
        options: [
          "Số 2 là số nguyên tố chẵn duy nhất",
          "Số 1 là số nguyên tố",
          "Mọi số nguyên tố đều là số lẻ",
          "Có vô số số nguyên tố"
        ],
        correctAnswers: [true, false, false, true],
        explanation: "Số 1 không phải số nguyên tố. Số 2 là số nguyên tố chẵn."
      }
    ]
  };
  return JSON.stringify(sample, null, 2);
};

export const generateSampleWordContent = () => {
  return `Title: Đề thi mẫu tổng hợp (Word)
Subject: Toán
Topic: regular
Duration: 45
---
1. 1 + 1 bằng mấy?
A. 1
B. 2
C. 3
D. 4
Answer: B

Type: true_false
2. Xét các mệnh đề sau về số nguyên tố:
a. Số 2 là số nguyên tố chẵn duy nhất
b. Số 1 là số nguyên tố
c. Mọi số nguyên tố đều là số lẻ
d. Có vô số số nguyên tố
Answer: Đúng, Sai, Sai, Đúng
`;
};
