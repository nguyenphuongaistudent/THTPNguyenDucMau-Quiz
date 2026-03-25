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
    
    // Replace block elements with newlines to preserve structure before text extraction
    const processedHtml = html
      .replace(/<\/p>/g, '\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<\/li>/g, '\n')
      .replace(/<\/tr>/g, '\n')
      .replace(/<\/div>/g, '\n')
      .replace(/<\/h[1-6]>/g, '\n');
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processedHtml;
    const text = tempDiv.textContent || '';
    
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
      
      const titleMatch = line.match(/^(title|tiêu đề|tên đề thi|tên bài thi)[\.\:]\s*(.*)/i);
      if (titleMatch) {
        title = titleMatch[2].trim();
        continue;
      }
      
      const subjectMatch = line.match(/^(subject|môn học|môn)[\.\:]\s*(.*)/i);
      if (subjectMatch) {
        subject = subjectMatch[2].trim();
        continue;
      }
      
      const topicMatch = line.match(/^(topic|chủ đề|loại đề)[\.\:]\s*(.*)/i);
      if (topicMatch) {
        const t = topicMatch[2].trim().toLowerCase();
        if (['regular', 'periodic', 'graduation'].includes(t)) {
          topic = t as QuizTopic;
        }
        continue;
      }
      
      const durationMatch = line.match(/^(duration|thời gian|thời lượng)[\.\:]\s*(\d+)/i);
      if (durationMatch) {
        duration = parseInt(durationMatch[2]) || 30;
        continue;
      }
      
      const typeMatch = line.match(/^(type|loại câu hỏi)[\.\:]\s*(.*)/i);
      if (typeMatch) {
        const t = typeMatch[2].trim().toLowerCase();
        if (t === 'true_false' || t === 'multiple_choice' || t === 'đúng sai' || t === 'trắc nghiệm') {
          currentType = (t === 'đúng sai' || t === 'true_false') ? 'true_false' : 'multiple_choice';
        }
        continue;
      }

      if (line === '---' || line.startsWith('===')) {
        parsingQuestions = true;
        continue;
      }

      // Auto-detect question start if no separator found
      // More flexible regex for question detection:
      // 1. or 1: or 1/ or 1) or (1) or [1]
      // Câu 1. or Câu 1: or Câu 1/ or Câu 1)
      // Question 1. or Question 1:
      const questionPattern = /^(\d+\s*[\.\:\/\)]|(Câu|Question|Câu hỏi|Câu số)\s*\d+\s*[\.\:\/\)]|\(\d+\)|\[\d+\])/i;
      
      if (!parsingQuestions && line.match(questionPattern)) {
        parsingQuestions = true;
      }

      if (parsingQuestions) {
        // Detect new question
        const questionMatch = line.match(questionPattern);
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
        // Support more than A-D and multiple separators and optional brackets
        const optionPattern = /^([A-Z]|[a-z]|\d+)\s*[\.\:\/\)]|^[\(\[]([A-Z]|[a-z]|\d+)[\)\]]\s*[\.\:\/\)]?|^[\(\[]([A-Z]|[a-z]|\d+)[\)\]]/i;
        const optionMatch = line.match(optionPattern);
        
        if (optionMatch && currentQuestion) {
          const optText = line.replace(optionMatch[0], '').trim();
          if (!currentQuestion.options) currentQuestion.options = [];
          currentQuestion.options.push(optText);
          continue;
        }

        // Detect answer
        const answerPattern = /^(Answer|Đáp án|Dap an|Chọn|Đáp án đúng|Dap an dung)\s*[\.\:]\s*(.*)/i;
        const answerMatch = line.match(answerPattern);
        if (answerMatch && currentQuestion) {
          const ansContent = answerMatch[2].trim();
          
          if (currentQuestion.type === 'multiple_choice') {
            // Handle formats like "A", "A.", "(A)", "Đáp án A"
            const cleanAns = ansContent.replace(/[\(\)\[\]\.\:]/g, '').trim().toUpperCase();
            const ansChar = cleanAns.charAt(0);
            if (ansChar >= 'A' && ansChar <= 'Z') {
              currentQuestion.correctOptionIndex = ansChar.charCodeAt(0) - 65;
            }
          } else {
            // True/False answer format: "Đúng, Sai, Sai, Đúng" or "T, F, F, T"
            const parts = ansContent.split(/[\,\s\.\/]+/).map(p => p.toLowerCase());
            currentQuestion.correctAnswers = parts.map(p => 
              p === 'đúng' || p === 't' || p === 'true' || p === 'd' || p === '1' || p === 'x'
            );
          }
          continue;
        }
        
        // If it's just text and we have a current question, append to text or the last option
        if (currentQuestion && !line.match(/^(Answer|Đáp án|Dap an|Chọn|Đáp án đúng|Dap an dung|Title|Subject|Topic|Duration|Type|Môn học|Tiêu đề|Chủ đề|Thời gian|Loại câu hỏi|Tên đề thi|Tên bài thi|Loại đề)/i)) {
          if (currentQuestion.options && currentQuestion.options.length > 0) {
            // Continuation of last option
            const lastIdx = currentQuestion.options.length - 1;
            const separator = currentQuestion.type === 'multiple_choice' ? ' ' : '<br>';
            currentQuestion.options[lastIdx] = currentQuestion.options[lastIdx] + separator + line;
          } else {
            // Continuation of question text
            currentQuestion.text = (currentQuestion.text || '') + (currentQuestion.text ? '<br>' : '') + line;
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
A. Lựa chọn 1
B. Lựa chọn 2
(Có thể viết nhiều dòng)
C. Lựa chọn 3
D. Lựa chọn 4
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
