import React, { useState, useCallback, memo, useEffect } from "react";
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Paper,
  Drawer,
  Button,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
} from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import QueryEditor from "./QueryEditor";
import ResultViewer from "./ResultViewer";
import QueryHistory from "./QueryHistory";

const RightPanel = memo(({ selectedServer, onSchemaRefresh }) => {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState({
    tables: [],
    columns: [],
    indexes: [],
  });

  const formatBytes = useCallback((bytes) => {
    if (bytes === null || bytes === undefined) return "Unknown";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
  }, []);

  useEffect(() => {
    let unlistenPromise;

    const loadAutocomplete = async (serverId) => {
      try {
        const items = await invoke("get_autocomplete_items", { serverId });
        setAutocompleteItems(items);
      } catch (error) {
        console.error("Failed to load autocomplete items:", error);
      }
    };

    if (selectedServer?.id) {
      loadAutocomplete(selectedServer.id);
    } else {
      setAutocompleteItems({ tables: [], columns: [], indexes: [] });
    }

    unlistenPromise = listen("schema_updated", (event) => {
      if (event?.payload?.serverId === selectedServer?.id) {
        loadAutocomplete(selectedServer.id);
      }
    });

    return () => {
      if (unlistenPromise) {
        unlistenPromise.then((fn) => fn());
      }
    };
  }, [selectedServer]);

  useEffect(() => {
    const handleOpenSqlFileTab = (event) => {
      const { server, file } = event.detail || {};
      if (!server || !file) return;

      const newTab = {
        id: Date.now(),
        type: "file",
        serverId: server.id,
        serverName: server.name,
        filePath: file.path,
        fileName: file.name,
        fileSize: file.sizeBytes,
        createdAt: file.createdAt,
        results: null,
        error: null,
        isExecuting: false,
        isCancelling: false,
        queryId: null,
        executionTime: null,
        rowsAffected: null,
      };

      setTabs((prev) => {
        const newTabs = [...prev, newTab];
        setActiveTab(newTabs.length - 1);
        return newTabs;
      });
    };

    window.addEventListener("open-sql-file-tab", handleOpenSqlFileTab);
    return () => {
      window.removeEventListener("open-sql-file-tab", handleOpenSqlFileTab);
    };
  }, []);

  // Create a new query tab
  const handleNewTab = useCallback(() => {
    if (!selectedServer) return;

    const newTab = {
      id: Date.now(),
      type: "query",
      serverId: selectedServer.id,
      serverName: selectedServer.name,
      sql: "",
      results: null,
      error: null,
      isExecuting: false,
      isCancelling: false,
      queryId: null,
      executionTime: null,
      rowsAffected: null,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTab(tabs.length);
  }, [selectedServer, tabs.length]);

  // Close a tab
  const handleCloseTab = useCallback(
    (tabId, event) => {
      event?.stopPropagation();

      setTabs((prev) => {
        const newTabs = prev.filter((tab) => tab.id !== tabId);

        // Adjust active tab if needed
        if (activeTab >= newTabs.length && newTabs.length > 0) {
          setActiveTab(newTabs.length - 1);
        } else if (newTabs.length === 0) {
          setActiveTab(0);
        }

        return newTabs;
      });
    },
    [activeTab],
  );

  // Change active tab
  const handleTabChange = useCallback((event, newValue) => {
    setActiveTab(newValue);
  }, []);

  // Execute query for a tab
  const handleExecute = useCallback(
    async (sql) => {
      const currentTab = tabs[activeTab];
      if (!currentTab || !sql.trim()) return;

      const isSchemaChanging = (statement) =>
        /(^|\s)(create|alter)\s+/i.test(statement);

      const queryId = `${currentTab.id}-${Date.now()}`;

      // Update tab state to executing
      setTabs((prev) =>
        prev.map((tab, index) =>
          index === activeTab
            ? {
                ...tab,
                isExecuting: true,
                isCancelling: false,
                error: null,
                queryId,
              }
            : tab,
        ),
      );

      const startTime = Date.now();

      try {
        const result = await invoke("execute_query", {
          serverId: currentTab.serverId,
          sql: sql.trim(),
          queryId,
        });

        const executionTime = Date.now() - startTime;

        // Update tab with results
        setTabs((prev) =>
          prev.map((tab, index) =>
            index === activeTab
              ? {
                  ...tab,
                  sql,
                  results: result,
                  error: null,
                  isExecuting: false,
                  isCancelling: false,
                  queryId: null,
                  executionTime,
                  rowsAffected: result?.rowsAffected || null,
                }
              : tab,
          ),
        );

        if (onSchemaRefresh && isSchemaChanging(sql)) {
          onSchemaRefresh({ id: currentTab.serverId });
        }
      } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error?.toString?.() || String(error);
        const isCanceled =
          errorMessage.includes("57014") ||
          errorMessage.toLowerCase().includes("canceling statement due to user request");

        // Update tab with error
        setTabs((prev) =>
          prev.map((tab, index) =>
            index === activeTab
              ? {
                  ...tab,
                  sql,
                  results: null,
                  error: isCanceled
                    ? "Query canceled."
                    : `Error executing query:\n${sql}\n\n${errorMessage}`,
                  isExecuting: false,
                  isCancelling: false,
                  queryId: null,
                  executionTime,
                }
              : tab,
          ),
        );
      }
    },
    [tabs, activeTab, onSchemaRefresh],
  );

  const handleCancel = useCallback(async () => {
    const currentTab = tabs[activeTab];
    if (!currentTab?.queryId) return;

    setTabs((prev) =>
      prev.map((tab, index) =>
        index === activeTab ? { ...tab, isCancelling: true } : tab,
      ),
    );

    try {
      await invoke("cancel_query", { queryId: currentTab.queryId });
    } catch (error) {
      setTabs((prev) =>
        prev.map((tab, index) =>
          index === activeTab ? { ...tab, isCancelling: false } : tab,
        ),
      );
    }
  }, [tabs, activeTab]);

  // Clear results for current tab
  const handleClear = useCallback(() => {
    setTabs((prev) =>
      prev.map((tab, index) =>
        index === activeTab ? { ...tab, results: null, error: null } : tab,
      ),
    );
  }, [activeTab]);

  // Show query history panel
  const handleShowHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);

  // Close history panel
  const handleCloseHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  // Handle query selected from history - create new tab with the SQL
  const handleSelectQueryFromHistory = useCallback((sql) => {
    if (!selectedServer) return;

    // Create a new tab with the selected SQL
    const newTab = {
      id: Date.now(),
      type: "query",
      serverId: selectedServer.id,
      serverName: selectedServer.name,
      sql: sql,
      results: null,
      error: null,
      isExecuting: false,
      isCancelling: false,
      queryId: null,
      executionTime: null,
      rowsAffected: null,
    };

    setTabs((prev) => {
      const newTabs = [...prev, newTab];
      setActiveTab(newTabs.length - 1);
      return newTabs;
    });

    // Close the history panel
    setHistoryOpen(false);
  }, [selectedServer]);

  const currentTab = tabs[activeTab];

  const handleExecuteFile = useCallback(async () => {
    const active = tabs[activeTab];
    if (!active || active.type !== "file" || !active.filePath) return;

    setTabs((prev) =>
      prev.map((tab, index) =>
        index === activeTab
          ? {
              ...tab,
              isExecuting: true,
              isCancelling: false,
              error: null,
              queryId: null,
            }
          : tab,
      ),
    );

    const startTime = Date.now();

    try {
      const result = await invoke("execute_sql_file", {
        serverId: active.serverId,
        filePath: active.filePath,
      });

      const executionTime = Date.now() - startTime;

      setTabs((prev) =>
        prev.map((tab, index) =>
          index === activeTab
            ? {
                ...tab,
                results: result,
                error: null,
                isExecuting: false,
                isCancelling: false,
                queryId: null,
                executionTime,
                rowsAffected: result?.rowsAffected || null,
              }
            : tab,
        ),
      );

      if (onSchemaRefresh) {
        onSchemaRefresh({ id: active.serverId });
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error?.toString?.() || String(error);

      setTabs((prev) =>
        prev.map((tab, index) =>
          index === activeTab
            ? {
                ...tab,
                results: null,
                error: `Error executing file:\n${active.filePath}\n\n${errorMessage}`,
                isExecuting: false,
                isCancelling: false,
                queryId: null,
                executionTime,
              }
            : tab,
        ),
      );
    }
  }, [tabs, activeTab, onSchemaRefresh]);

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Tab Bar */}
      <Paper
        square
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
        }}
      >
        {tabs.length > 0 ? (
          <>
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ flex: 1 }}
            >
              {tabs.map((tab, index) => (
                <Tab
                  key={tab.id}
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <span>
                        {tab.type === "file"
                          ? tab.fileName || "SQL File"
                          : `${tab.serverName || "Query"} #${index + 1}`}
                      </span>
                      <Box
                        component="span"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleCloseTab(tab.id, e)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleCloseTab(tab.id, e);
                          }
                        }}
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 20,
                          height: 20,
                          borderRadius: 1,
                          cursor: "pointer",
                          "&:hover": {
                            backgroundColor: "action.hover",
                          },
                          "&:focus-visible": {
                            outline: "2px solid",
                            outlineColor: "primary.main",
                            outlineOffset: 1,
                          },
                        }}
                      >
                        <Close fontSize="small" />
                      </Box>
                    </Box>
                  }
                  sx={{
                    textTransform: "none",
                    minHeight: 48,
                  }}
                />
              ))}
            </Tabs>
            <Tooltip title="New query tab">
              <IconButton onClick={handleNewTab} disabled={!selectedServer}>
                <Add />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 2,
            }}
          >
            <Tooltip
              title={
                !selectedServer
                  ? "Select a server first"
                  : "Create a new query tab"
              }
            >
              <span>
                <IconButton
                  color="primary"
                  onClick={handleNewTab}
                  disabled={!selectedServer}
                  size="large"
                >
                  <Add />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        )}
      </Paper>

      {/* Tab Content */}
      {currentTab ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {currentTab.type === "file" ? (
            <>
              {/* SQL File Metadata (Top Half) */}
              <Box
                sx={{
                  height: "50%",
                  minHeight: 200,
                  borderBottom: 1,
                  borderColor: "divider",
                  overflow: "hidden",
                  p: 2,
                }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    height: "100%",
                    border: 1,
                    borderColor: "divider",
                    p: 2,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    backgroundColor: "grey.50",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 2,
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1">
                        SQL File
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      onClick={handleExecuteFile}
                      disabled={currentTab.isExecuting}
                      startIcon={
                        currentTab.isExecuting ? (
                          <CircularProgress size={16} />
                        ) : null
                      }
                    >
                      Execute file
                    </Button>
                  </Box>
                  <Divider />
                  <List dense sx={{ overflowY: "auto" }}>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="File name"
                        secondary={currentTab.fileName || "Unknown"}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="File size"
                        secondary={formatBytes(currentTab.fileSize)}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Date created"
                        secondary={
                          currentTab.createdAt
                            ? new Date(currentTab.createdAt).toLocaleString()
                            : "Unknown"
                        }
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Path"
                        secondary={currentTab.filePath || "Unknown"}
                      />
                    </ListItem>
                  </List>
                </Paper>
              </Box>

              {/* Result Viewer (Bottom Half) */}
              <Box
                sx={{
                  height: "50%",
                  overflow: "hidden",
                }}
              >
                <ResultViewer
                  results={currentTab.results}
                  error={currentTab.error}
                  isLoading={currentTab.isExecuting}
                  executionTime={currentTab.executionTime}
                  rowsAffected={currentTab.rowsAffected}
                />
              </Box>
            </>
          ) : (
            <>
              {/* Query Editor (Top Half) */}
              <Box
                sx={{
                  height: "50%",
                  minHeight: 200,
                  borderBottom: 1,
                  borderColor: "divider",
                  overflow: "hidden",
                }}
              >
                <QueryEditor
                  key={currentTab.id}
                  serverId={currentTab.serverId}
                  serverName={currentTab.serverName}
                  initialSql={currentTab.sql}
                  autocompleteItems={autocompleteItems}
                  onExecute={handleExecute}
                  onCancel={handleCancel}
                  onClear={handleClear}
                  onShowHistory={handleShowHistory}
                  isExecuting={currentTab.isExecuting}
                  isCancelling={currentTab.isCancelling}
                />
              </Box>

              {/* Result Viewer (Bottom Half) */}
              <Box
                sx={{
                  height: "50%",
                  overflow: "hidden",
                }}
              >
                <ResultViewer
                  results={currentTab.results}
                  error={currentTab.error}
                  isLoading={currentTab.isExecuting}
                  executionTime={currentTab.executionTime}
                  rowsAffected={currentTab.rowsAffected}
                />
              </Box>
            </>
          )}
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2,
            color: "text.secondary",
          }}
        >
          {selectedServer ? (
            <>
              <Add sx={{ fontSize: 64, opacity: 0.3 }} />
              <Box sx={{ textAlign: "center" }}>
                <p>Click the + button to create a new query tab</p>
                <p style={{ fontSize: "0.875rem" }}>
                  Server: <strong>{selectedServer.name}</strong>
                </p>
              </Box>
            </>
          ) : (
            <>
              <p>Select a server from the left panel to start querying</p>
            </>
          )}
        </Box>
      )}

      {/* Query History Drawer */}
      <Drawer
        anchor="right"
        open={historyOpen}
        onClose={handleCloseHistory}
        PaperProps={{
          sx: {
            width: 400,
            maxWidth: '90vw',
          },
        }}
      >
        <QueryHistory
          serverId={selectedServer?.id}
          onSelectQuery={handleSelectQueryFromHistory}
          onClose={handleCloseHistory}
        />
      </Drawer>
    </Box>
  );
});

RightPanel.displayName = "RightPanel";

export default RightPanel;
