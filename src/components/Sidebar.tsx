import React from 'react';
import { BarChart3, Code2, Database, FileSpreadsheet, RotateCcw } from 'lucide-react';
import type { CsvProfile, PythonScriptModule } from '../types/psl';

export type WorkspaceTab = 'scripts' | 'profiler' | 'statistics';

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  scripts: PythonScriptModule[];
  selectedScriptId: string;
  onSelectScript: (id: string) => void;
  profile: CsvProfile | null;
  onResetSample: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  scripts,
  selectedScriptId,
  onSelectScript,
  profile,
  onResetSample,
}) => {
  const navItems: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
    { id: 'scripts', label: 'Python Script Lab', icon: <Code2 className="w-4 h-4" /> },
    { id: 'profiler', label: 'CSV Schema & Memory', icon: <Database className="w-4 h-4" /> },
    { id: 'statistics', label: 'Statistical Tests', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-full lg:w-[264px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
      <div>
        <div className="h-14 px-5 flex items-center border-b border-slate-200">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            PitchLab PSL
          </span>
        </div>

        <nav className="p-3 space-y-1" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={isActive ? 'text-emerald-700' : 'text-slate-400'}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 pt-4 pb-2 border-t border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-2">Script Library (8 Modules)</p>
          <div className="space-y-0.5 max-h-[380px] overflow-y-auto pr-1">
            {scripts.map((sc) => {
              const selected = activeTab === 'scripts' && selectedScriptId === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    onSelectScript(sc.id);
                    onSelectTab('scripts');
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors cursor-pointer flex items-baseline gap-2 ${
                    selected
                      ? 'bg-slate-900 text-white font-medium'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className={`font-mono tabular-nums shrink-0 ${selected ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {sc.index}.
                  </span>
                  <span className="truncate">{sc.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {profile && (
        <div className="p-4 border-t border-slate-200 bg-slate-50/70">
          <div className="flex items-start gap-2.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-900 truncate" title={profile.fileName}>
                {profile.fileName}
              </p>
              <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                {profile.rowCount.toLocaleString()} rows · {profile.columnCount} cols
              </p>
            </div>
          </div>
          {!profile.isSampleDataset && (
            <button
              type="button"
              onClick={onResetSample}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Built-in PSL Sample</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
};
