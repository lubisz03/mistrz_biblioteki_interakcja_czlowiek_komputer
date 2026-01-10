import { ButtonHTMLAttributes } from 'react';

interface AnswerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  text: string;
  isSelected?: boolean;
  isCorrect?: boolean;
  isIncorrect?: boolean;
  showResult?: boolean;
}

export default function AnswerButton({
  label,
  text,
  isSelected = false,
  isCorrect = false,
  isIncorrect = false,
  showResult = false,
  className = '',
  ...props
}: AnswerButtonProps) {
  let bgColor = 'bg-blue-100 hover:bg-blue-200';
  let textColor = 'text-gray-800';
  let borderColor = 'border-blue-300';

  if (showResult) {
    if (isCorrect) {
      bgColor = 'bg-green-500';
      textColor = 'text-white';
      borderColor = 'border-green-600';
    } else if (isIncorrect) {
      bgColor = 'bg-red-500';
      textColor = 'text-white';
      borderColor = 'border-red-600';
    } else if (isSelected && !isCorrect) {
      bgColor = 'bg-red-300';
      textColor = 'text-white';
      borderColor = 'border-red-400';
    }
  } else if (isSelected) {
    bgColor = 'bg-primary';
    textColor = 'text-white';
    borderColor = 'border-primary';
  }

  return (
    <button
      className={`w-full text-left p-4 rounded-lg border-2 ${bgColor} ${textColor} ${borderColor} transition-all duration-200 hover:shadow-md ${className}`}
      disabled={showResult}
      {...props}
    >
      <div className="flex items-start gap-3">
        <span className="font-bold text-lg min-w-[2rem]">{label})</span>
        <span className="flex-1">{text}</span>
      </div>
    </button>
  );
}
