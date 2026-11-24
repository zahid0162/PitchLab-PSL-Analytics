/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { CsvProfilerView } from './components/CsvProfilerView';
import { PythonScriptLabView } from './components/PythonScriptLabView';
import { Sidebar, type WorkspaceTab } from './components/Sidebar';
import { StatisticalLabView } from './components/StatisticalLabView';
import { TopHeader } from './components/TopHeader';
import { PYTHON_SCRIPTS } from './data/pythonScripts';
import { buildSamplePslCsv } from './data/samplePslData';
import type { CsvProfile, DetectedSchema } from './types/psl';
import { profileCsvSource } from './utils/csvProfiler';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('scripts');
  const [selectedScriptId, setSelectedScriptId] = useState<string>(PYTHON_SCRIPTS[0].id);
  const [profile, setProfile] = useState<CsvProfile | null>(null);
  const [customFileName, setCustomFileName] = useState<string>('psl_matches.csv');
  const [customSchema, setCustomSchema] = useState<DetectedSchema | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(true);
  const [parseProgressRows, setParseProgressRows] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSampleDataset = useCallback(async () => {
    setIsParsing(true);
    setErrorMsg(null);
    setParseProgressRows(0);
    try {
      const { csvText, fileName } = buildSamplePslCsv();
      const result = await profileCsvSource(
        csvText,
        fileName,
        new Blob([csvText]).size,
        true,
        (rows) => setParseProgressRows(rows)
      );
      setProfile(result);
      setCustomFileName(result.fileName);
      setCustomSchema(result.detectedSchema);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to initialize sample PSL dataset.');
    } finally {
      setIsParsing(false);
    }
  }, []);

  useEffect(() => {
    void loadSampleDataset();
  }, [loadSampleDataset]);

  const handleUploadFile = async (file: File) => {
    setIsParsing(true);
    setErrorMsg(null);
    setParseProgressRows(0);
    try {
      const result = await profileCsvSource(file, file.name, file.size, false, (rows) =>
        setParseProgressRows(rows)
      );
      setProfile(result);
      setCustomFileName(result.fileName);
      setCustomSchema(result.detectedSchema);
      setActiveTab('profiler');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not parse CSV file.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        scripts={PYTHON_SCRIPTS}
        selectedScriptId={selectedScriptId}
        onSelectScript={setSelectedScriptId}
        profile={profile}
        onResetSample={() => void loadSampleDataset()}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader
          activeTab={activeTab}
          profile={profile}
          onUploadFile={(file) => void handleUploadFile(file)}
          isParsing={isParsing}
        />

        <main className="flex-1 p-6 max-w-[1320px] w-full mx-auto">
          {errorMsg && (
            <div
              role="alert"
              className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-xs flex items-center justify-between gap-4"
            >
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="font-medium underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {isParsing && !profile ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-slate-900">
                Scanning PSL dataset... {parseProgressRows.toLocaleString()} rows
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Computing column moments, quantiles, and statistical tests.
              </p>
            </div>
          ) : (
            profile &&
            customSchema && (
              <>
                {activeTab === 'scripts' && (
                  <PythonScriptLabView
                    scripts={PYTHON_SCRIPTS}
                    selectedScriptId={selectedScriptId}
                    onSelectScript={setSelectedScriptId}
                    fileName={customFileName}
                    schema={customSchema}
                    availableColumns={profile.columns.map((c) => c.name)}
                    onUpdateFileName={setCustomFileName}
                    onUpdateSchema={setCustomSchema}
                  />
                )}

                {activeTab === 'profiler' && (
                  <CsvProfilerView
                    profile={profile}
                    onUploadFile={(file) => void handleUploadFile(file)}
                    isParsing={isParsing}
                    parseProgressRows={parseProgressRows}
                  />
                )}

                {activeTab === 'statistics' && <StatisticalLabView profile={profile} />}
              </>
            )
          )}
        </main>
      </div>
    </div>
  );
}
