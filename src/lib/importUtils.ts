import * as mammoth from 'mammoth';
import { Question, QuestionType, QuizTopic, SpecialAttemptLimit } from '../types';

export interface ImportedQuiz {
  title: string;
  description: string;
  subject: string;
  topic: QuizTopic;
  duration: number;
  maxAttempts?: number;
  specialAttemptLimits?: SpecialAttemptLimit[];
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
    const options = {
      // @ts-ignore
      convertImage: mammoth.images.inline((element: any) => {
        return element.read("base64").then((imageBuffer: any) => {
          return {
            src: "data:" + element.contentType + ";base64," + imageBuffer
          };
        });
      })
    };

    const result = await mammoth.convertToHtml({ arrayBuffer }, options);
    const html = result.value;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const elements = Array.from(doc.body.children);
    
    let title = 'Bài thi mới (Imported)';
    let subject = 'Toán';
    let topic: QuizTopic = 'regular';
    let duration = 30;
    let questions: Partial<Question>[] = [];
    
    let currentQuestion: Partial<Question> | null = null;
    let parsingQuestions = false;
    let currentType: QuestionType = 'multiple_choice';
    let currentOptionIndex = -1;

    const questionPattern = /^(\d+\s*[\.\:\/\)]|(Câu|Question|Câu hỏi|Câu số)\s*\d+\s*[\.\:\/\)]|\(\d+\)|\[\d+\])/i;
    const sectionPattern = /^(Phần|Part|PHẦN)\s*([12I]+|I|II)[\.\:\/\-]?/i;
    const optionPattern = /^([A-Z]|[a-z])\s*[\.\:\/\)]|^[\(\[]([A-Z]|[a-z])[\)\]]\s*[\.\:\/\)]?|^[\(\[]([A-Z]|[a-z])[\)\]]/i;
    const answerPattern = /^(Answer|Đáp án|Dap an|Chọn|Đáp án đúng|Dap an dung)\s*[\.\:]\s*(.*)/i;
    const metadataPattern = /^(title|tiêu đề|tên đề thi|tên bài thi|subject|môn học|môn|topic|chủ đề|loại đề|duration|thời gian|thời lượng|type|loại câu hỏi)[\.\:]\s*(.*)/i;
    const explanationPattern = /^(Explanation|Giải thích|Giai thich|Lời giải|Lời giải chi tiết)[\.\:]\s*(.*)/i;

    for (const el of elements) {
      const text = el.textContent?.trim() || '';
      if (!text && !el.querySelector('img') && el.tagName !== 'TABLE') continue;

      // Check for section headers
      const sectionMatch = text.match(sectionPattern);
      if (sectionMatch) {
        if (currentQuestion) {
          questions.push(currentQuestion);
          currentQuestion = null;
        }
        parsingQuestions = true;
        const sectionNum = (sectionMatch[2] || '').toUpperCase();
        const sectionText = text.toUpperCase();
        
        if (sectionNum === '1' || sectionNum === 'I' || sectionText.includes('TRẮC NGHIỆM')) {
          currentType = 'multiple_choice';
        } else if (sectionNum === '2' || sectionNum === 'II' || sectionText.includes('ĐÚNG SAI') || sectionText.includes('ĐÚNG/SAI')) {
          currentType = 'true_false';
        }
        continue;
      }

      // Check for metadata
      const metaMatch = text.match(metadataPattern);
      if (!parsingQuestions && metaMatch) {
        const key = metaMatch[1].toLowerCase();
        const value = metaMatch[2].trim();

        if (key.match(/title|tiêu đề|tên đề thi|tên bài thi/)) title = value;
        else if (key.match(/subject|môn học|môn/)) subject = value;
        else if (key.match(/topic|chủ đề|loại đề/)) {
          if (['regular', 'periodic', 'graduation'].includes(value.toLowerCase())) {
            topic = value.toLowerCase() as QuizTopic;
          }
        }
        else if (key.match(/duration|thời gian|thời lượng/)) duration = parseInt(value) || 30;
        else if (key.match(/type|loại câu hỏi/)) {
          if (value.toLowerCase().match(/true_false|đúng sai/)) currentType = 'true_false';
          else currentType = 'multiple_choice';
        }
        continue;
      }

      // Check for separator
      if (text === '---' || text.startsWith('===')) {
        parsingQuestions = true;
        continue;
      }

      // Detect question start
      const questionMatch = text.match(questionPattern);
      if (questionMatch) {
        parsingQuestions = true;
        if (currentQuestion) questions.push(currentQuestion);
        
        // Strip the question number from the HTML content
        let questionHtml = el.outerHTML;
        const matchedText = questionMatch[0];
        // Create a temporary div to manipulate HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = el.innerHTML;
        
        // Find the text node that contains the match and remove it
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
        let node;
        while (node = walker.nextNode()) {
          if (node.textContent?.includes(matchedText)) {
            node.textContent = node.textContent.replace(matchedText, '').trim();
            break;
          }
        }
        
        currentQuestion = {
          type: currentType,
          text: tempDiv.innerHTML || el.outerHTML,
          options: [],
          correctOptionIndex: currentType === 'multiple_choice' ? 0 : undefined,
          correctAnswers: currentType === 'true_false' ? [] : undefined,
          explanation: '',
          order: questions.length
        };
        currentOptionIndex = -1;
        continue;
      }

      // Detect option start
      const optionMatch = text.match(optionPattern);
      if (parsingQuestions && currentQuestion && optionMatch) {
        if (!currentQuestion.options) currentQuestion.options = [];
        currentQuestion.options.push(el.outerHTML);
        currentOptionIndex = currentQuestion.options.length - 1;
        continue;
      }

      // Detect answer
      const answerMatch = text.match(answerPattern);
      if (parsingQuestions && currentQuestion && answerMatch) {
        const ansContent = answerMatch[2].trim();
        
        if (currentQuestion.type === 'multiple_choice') {
          const cleanAns = ansContent.replace(/[\(\)\[\]\.\:]/g, '').trim().toUpperCase();
          const ansChar = cleanAns.charAt(0);
          if (ansChar >= 'A' && ansChar <= 'Z') {
            currentQuestion.correctOptionIndex = ansChar.charCodeAt(0) - 65;
          }
        } else {
          const parts = ansContent.split(/[\,\s\.\/]+/).map(p => p.toLowerCase());
          currentQuestion.correctAnswers = parts.map(p => 
            p === 'đúng' || p === 't' || p === 'true' || p === 'd' || p === '1' || p === 'x'
          );
        }
        continue;
      }

      // Detect explanation
      const explanationMatch = text.match(explanationPattern);
      if (parsingQuestions && currentQuestion && explanationMatch) {
        currentQuestion.explanation = explanationMatch[2].trim();
        continue;
      }

      // Append to current context
      if (parsingQuestions && currentQuestion) {
        if (currentOptionIndex >= 0 && currentQuestion.options) {
          currentQuestion.options[currentOptionIndex] += el.outerHTML;
        } else {
          currentQuestion.text += el.outerHTML;
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
Explanation: 1 + 1 = 2, nên chọn B.

Type: true_false
2. Xét các mệnh đề sau về số nguyên tố:
a. Số 2 là số nguyên tố chẵn duy nhất
b. Số 1 là số nguyên tố
c. Mọi số nguyên tố đều là số lẻ
d. Có vô số số nguyên tố
Answer: Đúng, Sai, Sai, Đúng
Explanation: Số 1 không phải số nguyên tố. Số 2 là số nguyên tố chẵn duy nhất.
`;
};
