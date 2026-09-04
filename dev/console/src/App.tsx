import React, { useState, useEffect } from 'react';
import { Box, useInput, useApp, useStdout, useStdin } from 'ink';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { Footer } from './components/Footer.js';
import { DashboardTab } from './components/tabs/DashboardTab.js';
import { NodesTab } from './components/tabs/NodesTab.js';
import { UsersTab } from './components/tabs/UsersTab.js';
import { ConferencesPage } from './components/tabs/ConferencesPage.js';
import { LogsTab } from './components/tabs/LogsTab.js';
import { DoorsTab } from './components/tabs/DoorsTab.js';
import { HealthCheckPage } from './components/tabs/HealthCheckPage.js';
import { AuditLogPage } from './components/tabs/AuditLogPage.js';
import { SessionLogsPage } from './components/tabs/SessionLogsPage.js';
import { OperatorChatPage } from './components/tabs/OperatorChatPage.js';
import { SecurityPage } from './components/tabs/SecurityPage.js';
import { DoorInstallPage } from './components/tabs/DoorInstallPage.js';
import { ImportExportPage } from './components/tabs/ImportExportPage.js';
import { GlobalWallPage } from './components/tabs/GlobalWallPage.js';
import { DeploymentPage } from './components/tabs/DeploymentPage.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { RestartDialog } from './components/RestartDialog.js';
import { ActivityPage } from './components/tabs/ActivityPage.js';
import { StatisticsPage } from './components/tabs/StatisticsPage.js';
import { ConfigurationPage } from './components/tabs/ConfigurationPage.js';
import { ConfigFilesPage } from './components/tabs/ConfigFilesPage.js';
import { LookupTablesPage } from './components/tabs/LookupTablesPage.js';
import { HealthDeploymentPage } from './components/tabs/HealthDeploymentPage.js';
import { DEFAULT_PAGE } from './pages/registry.js';
import { getNodes } from './api/client.js';
import { FocusProvider, useFocus } from './contexts/FocusContext.js';

interface Props {
  username: string;
}

// ... rest of the file

// Map page id → component. Keys mirror the registry (which mirrors the web
// config-app's nav-config.ts). TUI keeps individual pages rather than the
// web's tab workspaces so a sidebar entry is one item per row.
const PAGE_COMPONENTS: Record<string, React.FC | undefined> = {
  // Live
  overview:       DashboardTab,
  activity:       ActivityPage,
  nodes:          NodesTab,
  'operator-chat': OperatorChatPage,
  // People
  users:          UsersTab,
  security:       SecurityPage,
  // Content
  conferences:    ConferencesPage,
  doors:          DoorsTab,
  'door-install': DoorInstallPage,
  'global-wall':  GlobalWallPage,
  // System
  configuration:  ConfigurationPage,
  'config-files': ConfigFilesPage,
  'lookup-tables': LookupTablesPage,
  health:         HealthDeploymentPage,
  // Diagnostics
  statistics:     StatisticsPage,
  logs:           LogsTab,
  'session-logs': SessionLogsPage,
  audit:          AuditLogPage,
  'import-export': ImportExportPage,
};

export function App({ username }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { focusNext, focusPrevious, activeZone, setActiveZone } = useFocus();
  const termHeight = stdout?.rows ?? 24;
  const [activePage, setActivePage] = useState<string>(DEFAULT_PAGE);
  const [backendUp, setBackendUp] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showRestart, setShowRestart] = useState(false);
  const { stdin } = useStdin();

  // Global Tab/Shift+Tab for panel switching
  useInput((input, key) => {
    if (showRestart || showHelp) return;
    if (input === 'q' && !key.ctrl) exit();
    if (input === '?') setShowHelp(s => !s);
    // Tab / Shift+Tab for panel switching
    if (key.tab && !key.shift) focusNext();
    if (key.tab && key.shift) focusPrevious();
  });

  // F2 handling via raw stdin (Ink's useInput doesn't expose F-keys)
  useEffect(() => {
    if (!stdin) return;
    const onData = (chunk: Buffer | string) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      // F2 raw sequences: xterm/tmux ESC-O-Q, vt220 ESC-[12~, linux ESC-[[B.
      if (s.includes('\u001bOQ') || s.includes('\u001b[12~') || s.includes('\u001b[[B')) {
        setShowRestart(prev => !prev);
      }
    };
    stdin.on('data', onData);
    return () => { stdin.off('data', onData); };
  }, [stdin]);

  useEffect(() => {
    async function checkBackend() {
      try { await getNodes(); setBackendUp(true); }
      catch { setBackendUp(false); }
    }
    checkBackend();
    const id = setInterval(checkBackend, 10_000);
    return () => clearInterval(id);
  }, []);

  const ActiveComponent = PAGE_COMPONENTS[activePage];

  // Layout:
  //   row 1-4         Header (full width)
  //   rows 5..H-3     Sidebar (left ~22 cols) | Content (rest)
  //   rows H-2..H     Footer (full width)
  // Pinning the root box height to termHeight so flexGrow inside the middle
  // row pushes Footer to the actual bottom.
  return (
    <FocusProvider>
      <Box flexDirection="column" height={termHeight}>
        <Header username={username} backendUp={backendUp} previewUp={true} watchUp={true} />
        <Box flexDirection="row" flexGrow={1}>
          <Sidebar activePageId={activePage} onSelect={setActivePage} />
          <Box flexGrow={1} flexDirection="column" paddingX={1}>
            {showRestart ? (
              <RestartDialog onClose={() => setShowRestart(false)} />
            ) : showHelp ? (
              <HelpOverlay activePageId={activePage} onClose={() => setShowHelp(false)} />
            ) : ActiveComponent ? (
              <ActiveComponent />
            ) : (
              <Box paddingY={2}>
                <></>
              </Box>
            )}
          </Box>
        </Box>
        <Footer activePageId={activePage} />
      </Box>
    </FocusProvider>
  );
}
