import React, { useMemo, useState } from 'react';
import { FileUp, Search } from 'lucide-react';
import type { ColumnStat, CsvProfile } from '../types/psl';

interface CsvProfilerViewProps {
  profile: CsvProfile;
  onUploadFile: (file: File) => void;
  isParsing: boolean;
  parseProgressRows: number;
}

function getPreMlAction(col: ColumnStat): { label: string; tone: 'nominal' | 'warn' | 'alert' } {
  if (col.missingPct > 35) return { label: 'High missingness · indicator + impute', tone: 'alert' };
  if (col.inferredType === 'numeric' && col.skewness !== undefined && Math.abs(col.skewness) > 1.0) {
    return { label: 'Right-skewed · Yeo-Johnson / log1p', tone: 'warn' };
  }
  if (col.inferredType === 'numeric' && (col.iqrOutliers ?? 0) > col.nonNullCount * 0.03) {
    return { label: 'Outliers present · RobustScaler', tone: 'warn' };
  }
  if (col.inferredType === 'categorical' && col.uniqueCount > 40) {
    return { label: 'High cardinality · Out-of-fold TargetEnc', tone: 'warn' };
  }
  if (col.inferredType === 'categorical') {
    return { label: 'Low cardinality · category dtype / OHE', tone: 'nominal' };
  }
  return { label: 'Clean · Standard / direct pass', tone: 'nominal' };
}

export const CsvProfilerView: React.FC<CsvProfilerViewProps> = ({
  profile,
  onUploadFile,
  isParsing,
  parseProgressRows,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColName, setSelectedColName] = useState<string>(profile.columns[0]?.name ?? '');
  const [dragOver, setDragOver] = useState(false);

  const filteredColumns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return profile.columns;
    return profile.columns.filter(
      (c) => c.name.toLowerCase().includes(q) || c.inferredType.toLowerCase().includes(q)
    );
  }, [profile.columns, searchQuery]);

  const selectedCol = useMemo(() => {
    return profile.columns.find((c) => c.name === selectedColName) ?? profile.columns[0] ?? null;
  }, [profile.columns, selectedColName]);

  const memorySavingsPct =
    profile.estimatedPandasMemoryMb > 0
      ? ((1 - profile.optimizedMemoryMb / profile.estimatedPandasMemoryMb) * 100).toFixed(1)
      : '0.0';

  const skewedCount = profile.columns.filter(
    (c) => c.inferredType === 'numeric' && c.skewness !== undefined && Math.abs(c.skewness) > 1.0
  ).length;

  const missingTotalCells = profile.columns.reduce((acc, c) => acc + c.nullCount, 0);
  const totalCells = profile.rowCount * Math.max(1, profile.columnCount);
  const overallMissingPct = ((missingTotalCells / Math.max(1, totalCells)) * 100).toFixed(2);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onUploadFile(file);
  };

  return (
    <div className="space-y-6">
      {/* Streaming Dropzone for Large PSL CSVs */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border border-dashed rounded-lg p-5 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          dragOver
            ? 'border-emerald-600 bg-emerald-50/70'
            : 'border-slate-300 bg-white'
        }`}
      >
        <div className="flex items-start gap-3">
          <FileUp className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {isParsing
                ? `Streaming CSV chunks... ${parseProgressRows.toLocaleString()} rows scanned`
                : 'Drop your big PSL CSV file here to profile schema, skewness & memory layout'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Parsed locally in browser using 512 KB streaming chunks & Pébay online moments (zero server upload).
            </p>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer whitespace-nowrap shrink-0 transition-colors">
          <span>Browse CSV File</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Total Observations</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {profile.rowCount.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 tabular-nums mt-1">
            {profile.columnCount} columns · scanned in {profile.parseDurationMs} ms
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Est. Pandas RAM Reduction</p>
          <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
            -{memorySavingsPct}%
          </p>
          <p className="text-xs text-slate-500 tabular-nums mt-1">
            {profile.estimatedPandasMemoryMb.toFixed(2)} MB naive → {profile.optimizedMemoryMb.toFixed(2)} MB
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Overall Missingness</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {overallMissingPct}%
          </p>
          <p className="text-xs text-slate-500 tabular-nums mt-1">
            {missingTotalCells.toLocaleString()} null cells across dataset
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Skewed Numeric Columns</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {skewedCount}
          </p>
          <p className="text-xs text-slate-500 tabular-nums mt-1">
            |skew| &gt; 1.0 requiring power transforms
          </p>
        </div>
      </div>

      {/* Schema & Pre-ML Diagnostics Table + Column Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Column Statistical Profile & Pre-ML Strategy
              </h2>
              <p className="text-xs text-slate-500">Click any column row to inspect quantiles or top categories.</p>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter columns..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 w-48 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                  <th className="py-2.5 px-4">Column</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Missing</th>
                  <th className="py-2.5 px-3 text-right">Unique</th>
                  <th className="py-2.5 px-3 text-right">Skewness</th>
                  <th className="py-2.5 px-3 text-right">IQR Outliers</th>
                  <th className="py-2.5 px-4">Pre-ML Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredColumns.map((col) => {
                  const action = getPreMlAction(col);
                  const isSelected = selectedCol?.name === col.name;
                  return (
                    <tr
                      key={col.name}
                      onClick={() => setSelectedColName(col.name)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {col.name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 capitalize">{col.inferredType}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {col.missingPct.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {col.uniqueCount.toLocaleString()}
                        {col.isCardinalityCapped ? '+' : ''}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {col.skewness !== undefined ? col.skewness.toFixed(2) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {col.iqrOutliers !== undefined ? col.iqrOutliers.toLocaleString() : '—'}
                      </td>
                      <td
                        className={`py-2.5 px-4 whitespace-nowrap font-medium ${
                          action.tone === 'alert'
                            ? 'text-red-700'
                            : action.tone === 'warn'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                        }`}
                      >
                        {action.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Column Detail Inspector */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          {selectedCol ? (
            <div className="space-y-4">
              <div className="pb-3 border-b border-slate-200">
                <p className="text-xs text-slate-500">Selected Feature</p>
                <h3 className="font-mono text-base font-bold text-slate-900 mt-0.5 break-all">
                  {selectedCol.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1 tabular-nums">
                  {selectedCol.inferredType} · {selectedCol.nonNullCount.toLocaleString()} non-null ·{' '}
                  {selectedCol.nullCount.toLocaleString()} missing
                </p>
              </div>

              {selectedCol.inferredType === 'numeric' && (
                <div className="space-y-2 text-xs">
                  <p className="font-semibold text-slate-900">Distribution & Quantiles</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-2 border-y border-slate-100 font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mean</span>
                      <span className="text-slate-900">{selectedCol.mean?.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Std Dev</span>
                      <span className="text-slate-900">{selectedCol.std?.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Min</span>
                      <span className="text-slate-900">{selectedCol.min?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Max</span>
                      <span className="text-slate-900">{selectedCol.max?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Q25</span>
                      <span className="text-slate-900">{selectedCol.q25?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Median</span>
                      <span className="text-slate-900">{selectedCol.median?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Q75</span>
                      <span className="text-slate-900">{selectedCol.q75?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Kurtosis</span>
                      <span className="text-slate-900">{selectedCol.kurtosis?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-slate-900">Top Observed Values</p>
                {selectedCol.topValues.length > 0 ? (
                  <div className="space-y-2">
                    {selectedCol.topValues.map((tv) => (
                      <div key={tv.value} className="text-xs">
                        <div className="flex justify-between gap-2 mb-1">
                          <span className="font-mono text-slate-800 truncate">{tv.value}</span>
                          <span className="font-mono tabular-nums text-slate-500 shrink-0">
                            {tv.count.toLocaleString()} ({tv.pct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(3, tv.pct))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No non-null values found.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Select a column to inspect its statistics.</p>
          )}
        </div>
      </div>

      {/* First 15 Rows Data Preview */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Raw Data Preview (First 15 Rows)
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            Showing {Math.min(15, profile.sampleRows.length)} of {profile.rowCount.toLocaleString()} rows
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                {profile.columns.slice(0, 12).map((c) => (
                  <th key={c.name} className="py-2 px-3 whitespace-nowrap font-medium">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profile.sampleRows.slice(0, 15).map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50">
                  {profile.columns.slice(0, 12).map((c) => (
                    <td key={c.name} className="py-2 px-3 whitespace-nowrap text-slate-700 tabular-nums max-w-[180px] truncate">
                      {row[c.name] === '' || row[c.name] === undefined ? (
                        <span className="text-slate-300">NULL</span>
                      ) : (
                        row[c.name]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
