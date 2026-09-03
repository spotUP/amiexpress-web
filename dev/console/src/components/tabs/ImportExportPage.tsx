import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { uploadArchive, getImportSession, validateImport, executeImport } from '../../api/client.js';
import type { ValidationResult, ImportSummary, ImportResult, ImportProgress } from '../../api/types.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';

type Step = 'upload' | 'validate' | 'resolve' | 'execute' | 'complete';
type Strategy = 'skip' | 'replace' | 'rename' | 'merge';

const STEP_ORDER: Step[] = ['upload', 'validate', 'resolve', 'execute', 'complete'];

function StepIndicator({ current }: { current: Step }) {
  const labels = ['1.Upload', '2.Validate', '3.Resolve', '4.Execute', '5.Complete'];
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <Box marginBottom={1} flexDirection="row" gap={2}>
      {STEP_ORDER.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <Text key={step} bold={active} color={done ? 'green' : active ? 'cyan' : 'gray'}>
            {done ? '[x]' : active ? '[>]' : '[ ]'} {labels[idx]}
          </Text>
        );
      })}
    </Box>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const width = 30;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return (
    <Box>
      <Text>{'['}</Text>
      <Text color="green">{'\u2588'.repeat(filled)}</Text>
      <Text dimColor>{'\u2591'.repeat(empty)}</Text>
      <Text>{']'} {percent}%</Text>
    </Box>
  );
}

function SummaryBox({ summary }: { summary: ImportSummary }) {
  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1} borderStyle="round" borderColor="cyan">
      <Text bold>Import Summary</Text>
      <Text>  Users: {summary.users}</Text>
      <Text>  Conferences: {summary.conferences}</Text>
      <Text>  Commands: {summary.commands}</Text>
      <Text>  Nodes: {summary.nodes}</Text>
    </Box>
  );
}

export function ImportExportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');

  // Upload state
  const [uploadPath, setUploadPath] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Validate state
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Resolve state
  const [strategies, setStrategies] = useState<{
    userConflictStrategy: Strategy;
    conferenceConflictStrategy: Strategy;
    commandConflictStrategy: Strategy;
  }>({
    userConflictStrategy: 'skip',
    conferenceConflictStrategy: 'skip',
    commandConflictStrategy: 'skip',
  });
  const [executing, setExecuting] = useState(false);

  // Execute state
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  // Complete state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Reset state
  const [confirmReset, setConfirmReset] = useState(false);

  const hasConflicts =
    (validationResult?.conflicts?.userConflicts?.length || 0) > 0 ||
    (validationResult?.conflicts?.conferenceConflicts?.length || 0) > 0 ||
    (validationResult?.conflicts?.commandConflicts?.length || 0) > 0;

  const loadSession = useCallback(async () => {
    if (!sessionId) return null;
    try {
      const data = await getImportSession(sessionId) as any;
      return data;
    } catch {
      return null;
    }
  }, [sessionId]);

  // Poll progress during execute
  useEffect(() => {
    if (step !== 'execute' || !sessionId) return;
    const interval = setInterval(async () => {
      const session = await loadSession() as any;
      if (session) {
        setProgress({
          id: session.id,
          status: session.status,
          progress: session.progress || 0,
          message: session.message,
        });
        if (session.status === 'completed') {
          setStep('complete');
          if (session.result) {
            setImportResult(session.result);
          }
          clearInterval(interval);
        } else if (session.status === 'failed') {
          setExecuteError(session.error || 'Import failed');
          clearInterval(interval);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [step, sessionId, loadSession]);

  const handleUpload = async () => {
    if (!uploadPath.trim()) {
      setUploadError('Please enter a file path');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadArchive(uploadPath.trim());
      setSessionId(result.sessionId);
      setFilename(result.filename);
      setStep('validate');
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleValidate = async () => {
    if (!sessionId) return;
    setValidating(true);
    setValidationError(null);
    try {
      const result = await validateImport(sessionId) as any;
      setValidationResult(result);
      setStep('resolve');
    } catch (e: any) {
      setValidationError(e.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleExecute = async () => {
    if (!sessionId) return;
    setExecuting(true);
    setExecuteError(null);
    try {
      await executeImport(sessionId);
      setStep('execute');
    } catch (e: any) {
      setExecuteError(e.message || 'Execute failed');
      setExecuting(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setSessionId(null);
    setFilename('');
    setUploadPath('');
    setUploadError(null);
    setValidationResult(null);
    setValidationError(null);
    setStrategies({
      userConflictStrategy: 'skip',
      conferenceConflictStrategy: 'skip',
      commandConflictStrategy: 'skip',
    });
    setProgress(null);
    setImportResult(null);
    setExecuteError(null);
  };

  useInput((input, key) => {
    if (confirmReset) {
      if (input === 'y' || input === 'Y') {
        setConfirmReset(false);
        handleReset();
      } else if (input === 'n' || input === 'N' || key.escape) {
        setConfirmReset(false);
      }
      return;
    }

    if (step === 'upload') {
      if (key.escape) { setUploadPath(''); return; }
      if (key.backspace || key.delete) { setUploadPath(v => v.slice(0, -1)); return; }
      if (key.return) { handleUpload(); return; }
      if (input && !key.ctrl && !key.meta) { setUploadPath(v => v + input); return; }
    }

    if (step === 'validate') {
      if (input === 'v' && !validating) { handleValidate(); return; }
      if (input === 'b') { setStep('upload'); return; }
    }

    if (step === 'resolve') {
      if (input === 's') { setStrategies(s => ({ ...s, userConflictStrategy: 'skip' })); return; }
      if (input === 'r') { setStrategies(s => ({ ...s, userConflictStrategy: 'replace' })); return; }
      if (input === 'm') { setStrategies(s => ({ ...s, userConflictStrategy: 'merge' })); return; }
      if (input === 'n') { setStrategies(s => ({ ...s, userConflictStrategy: 'rename' })); return; }
      if (input === 'S') { setStrategies(s => ({ ...s, conferenceConflictStrategy: 'skip' })); return; }
      if (input === 'R') { setStrategies(s => ({ ...s, conferenceConflictStrategy: 'replace' })); return; }
      if (input === 'M') { setStrategies(s => ({ ...s, conferenceConflictStrategy: 'merge' })); return; }
      if (input === 'N') { setStrategies(s => ({ ...s, conferenceConflictStrategy: 'rename' })); return; }
      if (input === 'c') { setStrategies(s => ({ ...s, commandConflictStrategy: 'skip' })); return; }
      if (input === 'C') { setStrategies(s => ({ ...s, commandConflictStrategy: 'replace' })); return; }
      if (input === 'x' && !hasConflicts && !executing) { handleExecute(); return; }
      if (input === 'b') { setStep('validate'); return; }
    }

    if (step === 'complete') {
      if (input === 'r') { setConfirmReset(true); return; }
    }
  });

  return (
    <Box flexDirection="column">
      <StepIndicator current={step} />

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Box flexDirection="column">
          <Text bold>Upload BBS Archive</Text>
          <Text dimColor>Enter path to archive file (LHA, LZX, ZIP, TAR):</Text>
          <Box marginTop={1}>
            <Text>{'> '}</Text>
            <Text color="cyan">{uploadPath}</Text>
            <Text>{'\u2588'}</Text>
          </Box>
          {uploadError && (
            <Box marginTop={1}>
              <Text color="red">Error: {uploadError}</Text>
            </Box>
          )}
          {uploading && (
            <Box marginTop={1}>
              <Text color="yellow"><Spinner type="dots" /></Text>
              <Text> Uploading...</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>[Enter] Upload  [Esc] Clear</Text>
          </Box>
        </Box>
      )}

      {/* Step 2: Validate */}
      {step === 'validate' && (
        <Box flexDirection="column">
          <Text bold>Validating Archive...</Text>
          <Box marginTop={1}>
            <Text dimColor>Filename: {filename}</Text>
          </Box>
          {validating && (
            <Box marginTop={1}>
              <Text color="yellow"><Spinner type="dots" /></Text>
              <Text> Validating...</Text>
            </Box>
          )}
          {!validating && validationError && (
            <Box marginTop={1}>
              <Text color="red">Error: {validationError}</Text>
            </Box>
          )}
          {!validating && !validationError && (
            <Box marginTop={1}>
              <Text dimColor>Press [v] to validate</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>[b] Back to Upload</Text>
          </Box>
        </Box>
      )}

      {/* Step 3: Resolve */}
      {step === 'resolve' && validationResult && (
        <Box flexDirection="column">
          <SummaryBox summary={validationResult.summary} />

          {hasConflicts ? (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="yellow">Conflicts Detected</Text>
              {validationResult.conflicts.userConflicts && validationResult.conflicts.userConflicts.length > 0 && (
                <Text dimColor>  Users: {validationResult.conflicts.userConflicts.length} conflict(s)</Text>
              )}
              {validationResult.conflicts.conferenceConflicts && validationResult.conflicts.conferenceConflicts.length > 0 && (
                <Text dimColor>  Conferences: {validationResult.conflicts.conferenceConflicts.length} conflict(s)</Text>
              )}
              {validationResult.conflicts.commandConflicts && validationResult.conflicts.commandConflicts.length > 0 && (
                <Text dimColor>  Commands: {validationResult.conflicts.commandConflicts.length} conflict(s)</Text>
              )}
            </Box>
          ) : (
            <Box marginBottom={1}>
              <Text color="green">No conflicts - ready to import</Text>
            </Box>
          )}

          <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="cyan">
            <Text bold>Resolution Strategies</Text>
            <Text>User:       [s]kip  [r]eplace  [m]erge  re[n]ame</Text>
            <Text>Conference: [S]kip  [R]eplace  [M]erge  re[N]ame</Text>
            <Text>Command:    [c]kip  [C]eplace</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text dimColor>User:       [{strategies.userConflictStrategy === 'skip' ? 'X' : ' '}] skip  [{strategies.userConflictStrategy === 'replace' ? 'X' : ' '}] replace  [{strategies.userConflictStrategy === 'merge' ? 'X' : ' '}] merge  [{strategies.userConflictStrategy === 'rename' ? 'X' : ' '}] rename</Text>
            <Text dimColor>Conference: [{strategies.conferenceConflictStrategy === 'skip' ? 'X' : ' '}] skip  [{strategies.conferenceConflictStrategy === 'replace' ? 'X' : ' '}] replace  [{strategies.conferenceConflictStrategy === 'merge' ? 'X' : ' '}] merge  [{strategies.conferenceConflictStrategy === 'rename' ? 'X' : ' '}] rename</Text>
            <Text dimColor>Command:    [{strategies.commandConflictStrategy === 'skip' ? 'X' : ' '}] skip  [{strategies.commandConflictStrategy === 'replace' ? 'X' : ' '}] replace</Text>
          </Box>

          {executing && (
            <Box marginTop={1}>
              <Text color="yellow"><Spinner type="dots" /></Text>
              <Text> Executing...</Text>
            </Box>
          )}
          {executeError && (
            <Box marginTop={1}>
              <Text color="red">Error: {executeError}</Text>
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>[x] Execute  [b] Back</Text>
          </Box>
        </Box>
      )}

      {/* Step 4: Execute */}
      {step === 'execute' && (
        <Box flexDirection="column">
          <Text bold>Importing BBS Data...</Text>
          <Box marginTop={1}>
            <Text dimColor>Session: {sessionId}</Text>
          </Box>
          <Box marginTop={1}>
            <ProgressBar percent={progress?.progress || 0} />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Status: {progress?.status || 'Starting...'}</Text>
          </Box>
          {progress?.message && (
            <Box marginTop={1}>
              <Text dimColor>Message: {progress.message}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Step 5: Complete */}
      {step === 'complete' && (
        <Box flexDirection="column">
          {importResult?.success ? (
            <Text bold color="green">Import completed successfully!</Text>
          ) : (
            <Text bold color="red">Import completed with errors</Text>
          )}

          {importResult && (
            <Box flexDirection="column" marginTop={1}>
              <Text>Users Imported: {importResult.usersImported}</Text>
              <Text>Conferences Imported: {importResult.conferencesImported}</Text>
              <Text>Commands Imported: {importResult.commandsImported}</Text>
            </Box>
          )}

          {importResult?.errors && importResult.errors.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="red">Errors ({importResult.errors.length}):</Text>
              {importResult.errors.slice(0, 5).map((e, i) => (
                <Text key={i} color="red" dimColor>  - {e}</Text>
              ))}
              {importResult.errors.length > 5 && (
                <Text dimColor>  ... and {importResult.errors.length - 5} more</Text>
              )}
            </Box>
          )}

          {importResult?.warnings && importResult.warnings.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="yellow">Warnings ({importResult.warnings.length}):</Text>
              {importResult.warnings.slice(0, 5).map((w, i) => (
                <Text key={i} color="yellow" dimColor>  - {w}</Text>
              ))}
              {importResult.warnings.length > 5 && (
                <Text dimColor>  ... and {importResult.warnings.length - 5} more</Text>
              )}
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>[r] Import Another Archive</Text>
          </Box>
        </Box>
      )}

      {/* Reset confirmation */}
      {confirmReset && (
        <ConfirmDialog
          message="Reset and start a new import?"
          onConfirm={() => { setConfirmReset(false); handleReset(); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </Box>
  );
}
