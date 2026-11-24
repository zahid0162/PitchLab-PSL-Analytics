import React, { useMemo, useState } from 'react';
import { Download, SlidersHorizontal } from 'lucide-react';
import type { DetectedSchema, PythonScriptModule, ScriptCategory } from '../types/psl';
import { PythonCodeBlock } from './PythonCodeBlock';

interface PythonScriptLabViewProps {
  scripts: PythonScriptModule[];
  selectedScriptId: string;
  onSelectScript: (id: string) => void;
  fileName: string;
  schema: DetectedSchema;
  availableColumns: string[];
  onUpdateFileName: (name: string) => void;
  onUpdateSchema: (next: DetectedSchema) => void;
}

const CATEGORIES: ScriptCategory[] = [
  'All',
  'Scale & Memory',
  'Statistics & Bayes',
  'Feature Engineering',
  'Unsupervised & Calibration',
];

const SCHEMA_FIELDS: { key: keyof DetectedSchema; label: string }[] = [
  { key: 'matchId', label: 'Match ID' },
  { key: 'season', label: 'Season' },
  { key: 'date', label: 'Date' },
  { key: 'venue', label: 'Venue' },
  { key: 'battingTeam', label: 'Batting Team' },
  { key: 'bowlingTeam', label: 'Bowling Team' },
  { key: 'tossWinner', label: 'Toss Winner' },
  { key: 'tossDecision', label: 'Toss Decision' },
  { key: 'innings', label: 'Innings' },
  { key: 'over', label: 'Over' },
  { key: 'ball', label: 'Ball' },
  { key: 'batter', label: 'Batter' },
  { key: 'bowler', label: 'Bowler' },
  { key: 'runsOffBat', label: 'Runs (Bat)' },
  { key: 'extras', label: 'Extras' },
  { key: 'wicketType', label: 'Wicket' },
  { key: 'winner', label: 'Match Winner' },
];

export const PythonScriptLabView: React.FC<PythonScriptLabViewProps> = ({
  scripts,
  selectedScriptId,
  onSelectScript,
  fileName,
  schema,
  availableColumns,
  onUpdateFileName,
  onUpdateSchema,
}) => {
  const [category, setCategory] = useState<ScriptCategory>('All');
  const [showMapper, setShowMapper] = useState(false);
  const [insightTab, setInsightTab] = useState<'intuition' | 'trap' | 'output'>('intuition');

  const filteredScripts = useMemo(() => {
    if (category === 'All') return scripts;
    return scripts.filter((s) => s.category === category);
  }, [scripts, category]);

  const activeScript = useMemo(() => {
    return scripts.find((s) => s.id === selectedScriptId) ?? filteredScripts[0] ?? scripts[0];
  }, [scripts, filteredScripts, selectedScriptId]);

  const generatedCode = useMemo(() => {
    return activeScript.generateCode({ fileName, schema });
  }, [activeScript, fileName, schema]);

  const handleDownloadAllBundle = () => {
    const bundle = scripts
      .map((sc) => {
        const divider = '# ' + '='.repeat(76);
        return `${divider}\n# MODULE ${sc.index}: ${sc.title}\n${divider}\n\n${sc.generateCode({ fileName, schema })}\n`;
      })
      .join('\n\n');

    const blob = new Blob([bundle], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'psl_pre_ml_python_suite.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filter & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategory(cat);
                  const firstMatch = cat === 'All' ? scripts[0] : scripts.find((s) => s.category === cat);
                  if (firstMatch) onSelectScript(firstMatch.id);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowMapper((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showMapper
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Map CSV Columns</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadAllBundle}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download All 8 (.py)</span>
          </button>
        </div>
      </div>

      {/* Collapsible CSV Column Mapper */}
      {showMapper && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Dynamic Python Column & Path Mapping
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every Python script updates live to match your local CSV filename and exact column headers.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="csv-filename-input" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                CSV Path:
              </label>
              <input
                id="csv-filename-input"
                type="text"
                value={fileName}
                onChange={(e) => onUpdateFileName(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 w-64 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4">
            {SCHEMA_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  {label}
                </label>
                {availableColumns.length > 0 ? (
                  <select
                    value={schema[key]}
                    onChange={(e) => onUpdateSchema({ ...schema, [key]: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="">-- default --</option>
                    {availableColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={schema[key]}
                    onChange={(e) => onUpdateSchema({ ...schema, [key]: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Horizontal Script Cards Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {filteredScripts.map((sc) => {
          const selected = sc.id === activeScript.id;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => onSelectScript(sc.id)}
              className={`text-left p-4 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between ${
                selected
                  ? 'bg-white border-emerald-600 ring-1 ring-emerald-600'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                  <span className="font-mono tabular-nums font-medium text-emerald-700">{sc.index}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{sc.category}</span>
                </div>
                <h3 className="font-display text-sm font-semibold text-slate-900 leading-snug">
                  {sc.title}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-2 font-mono truncate">
                {sc.libraries.join(' · ')}
              </p>
            </button>
          );
        })}
      </div>

      {/* Active Script Detail & Code Workspace */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
              <span className="font-mono font-medium text-emerald-700">Module {activeScript.index}</span>
              <span aria-hidden="true">·</span>
              <span>{activeScript.category}</span>
              <span aria-hidden="true">·</span>
              <span>{activeScript.complexity}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-700">{activeScript.libraries.join(', ')}</span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900" style={{ textWrap: 'balance' }}>
              {activeScript.title}
            </h2>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              {activeScript.conceptSummary}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setInsightTab('intuition')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                insightTab === 'intuition'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Statistical Intuition
            </button>
            <button
              type="button"
              onClick={() => setInsightTab('trap')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                insightTab === 'trap'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pre-ML Trap Avoided
            </button>
            <button
              type="button"
              onClick={() => setInsightTab('output')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                insightTab === 'output'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sample Output
            </button>
          </div>
        </div>

        {/* Insight Strip */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          {insightTab === 'intuition' && (
            <div>
              <p className="text-xs font-semibold text-slate-900 mb-1">
                Why This Statistical Method Matters
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {activeScript.statisticalIntuition}
              </p>
            </div>
          )}
          {insightTab === 'trap' && (
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-1">
                Common Pre-ML Mistake Prevented
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {activeScript.preMlTrapAvoided}
              </p>
            </div>
          )}
          {insightTab === 'output' && (
            <div>
              <p className="text-xs font-semibold text-slate-900 mb-2">
                Representative Console Output
              </p>
              <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                {activeScript.expectedOutputPreview}
              </pre>
            </div>
          )}
        </div>

        {/* Code Viewer */}
        <PythonCodeBlock
          code={generatedCode}
          fileName={`psl_${activeScript.index}_${activeScript.id.replace(/-/g, '_')}.py`}
        />
      </div>
    </div>
  );
};
