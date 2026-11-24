import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import type { CsvProfile } from '../types/psl';
import type { WorkspaceTab } from './Sidebar';

interface TopHeaderProps {
  activeTab: WorkspaceTab;
  profile: CsvProfile | null;
  onUploadFile: (file: File) => void;
  isParsing: boolean;
}

const TAB_TITLES: Record<WorkspaceTab, string> = {
  scripts: 'Python Pre-ML Script Lab',
  profiler: 'Dataset Schema & Memory Profiler',
  statistics: 'Live Statistical Tests & Distributions',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  profile,
  onUploadFile,
  isParsing,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
      e.target.value = '';
    }
  };

  return (
    <header className="h-14 px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-8 shrink-0">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-slate-500 whitespace-nowrap shrink-0">PSL Workbench</span>
        <span className="text-slate-300" aria-hidden="true">/</span>
        <h1 className="font-display font-semibold text-slate-900 truncate">
          {TAB_TITLES[activeTab]}
        </h1>
      </div>

      <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
        {profile ? (
          <>
            <span>{profile.isSampleDataset ? 'Sample PSL Dataset' : 'Uploaded CSV'}</span>
            <span aria-hidden="true">·</span>
            <span>{profile.rowCount.toLocaleString()} rows</span>
            <span aria-hidden="true">·</span>
            <span>{profile.optimizedMemoryMb.toFixed(2)} MB downcasted</span>
          </>
        ) : (
          <span>No dataset loaded</span>
        )}
      </div>

      <div className="shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload PSL CSV file"
        />
        <button
          type="button"
          disabled={isParsing}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-600 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{isParsing ? 'Scanning CSV...' : 'Upload PSL CSV'}</span>
        </button>
      </div>
    </header>
  );
};
