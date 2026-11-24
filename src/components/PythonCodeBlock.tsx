import React, { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';

interface PythonCodeBlockProps {
  code: string;
  fileName: string;
}

const KEYWORDS = new Set([
  'import',
  'from',
  'as',
  'def',
  'return',
  'for',
  'in',
  'if',
  'elif',
  'else',
  'not',
  'and',
  'or',
  'is',
  'None',
  'True',
  'False',
  'with',
  'assert',
  'lambda',
  'class',
  'try',
  'except',
]);

const BUILTINS = new Set([
  'print',
  'len',
  'range',
  'int',
  'float',
  'str',
  'dict',
  'list',
  'set',
  'min',
  'max',
  'sum',
  'round',
  'sorted',
  'enumerate',
  'getattr',
  'abs',
]);

function highlightLine(line: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Simple single-line tokenizer: comments, triple/double/single strings, numbers, identifiers
  const tokenRegex = /(#.*$|"""|'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:_\d+)*(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(line.slice(lastIndex, match.index));
    }

    const tok = match[0];
    if (tok.startsWith('#')) {
      tokens.push(
        <span key={keyIdx++} className="text-slate-400 italic">
          {tok}
        </span>
      );
    } else if (tok.startsWith('"') || tok.startsWith("'")) {
      tokens.push(
        <span key={keyIdx++} className="text-emerald-300">
          {tok}
        </span>
      );
    } else if (/^\d/.test(tok)) {
      tokens.push(
        <span key={keyIdx++} className="text-amber-300">
          {tok}
        </span>
      );
    } else if (KEYWORDS.has(tok)) {
      tokens.push(
        <span key={keyIdx++} className="text-sky-300 font-medium">
          {tok}
        </span>
      );
    } else if (BUILTINS.has(tok)) {
      tokens.push(
        <span key={keyIdx++} className="text-teal-200">
          {tok}
        </span>
      );
    } else {
      tokens.push(tok);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push(line.slice(lastIndex));
  }

  return tokens.length > 0 ? tokens : [' '];
}

export const PythonCodeBlock: React.FC<PythonCodeBlockProps> = ({ code, fileName }) => {
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => code.split('\n'), [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback copy
      const area = document.createElement('textarea');
      area.value = code;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span className="text-slate-200 font-medium">{fileName}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Code'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .py</span>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto p-4 text-[13px] leading-6 font-mono">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-slate-900/60">
                <td className="select-none pr-4 text-right text-slate-600 tabular-nums w-10 align-top">
                  {idx + 1}
                </td>
                <td className="whitespace-pre text-slate-100">{highlightLine(line)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
