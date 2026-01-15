import React, { useState, useCallback, memo } from "react";
import { Box, Tabs, Tab, IconButton, Tooltip, Paper } from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import { invoke } from "@tauri-apps/api/tauri";
import QueryEditor from "./QueryEditor";
import ResultViewer from "./ResultViewer";

const RightPanel = memo(({ selectedServer }) => {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(0);

  // Create a new query tab
  const handleNewTab = useCallback(() => {
    if (!selectedServer) return;

    const newTab = {
      id: Date.now(),
      serverId: selectedServer.id,
      serverName: selectedServer.name,
      sql: "",
      results: null,
      error: null,
      isExecuting: false,
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

      // Update tab state to executing
      setTabs((prev) =>
        prev.map((tab, index) =>
          index === activeTab
            ? { ...tab, isExecuting: true, error: null }
            : tab,
        ),
      );

      const startTime = Date.now();

      try {
        const result = await invoke("execute_query", {
          serverId: currentTab.serverId,
          sql: sql.trim(),
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
                  executionTime,
                  rowsAffected: result?.rowsAffected || null,
                }
              : tab,
          ),
        );
      } catch (error) {
        const executionTime = Date.now() - startTime;

        // Update tab with error
        setTabs((prev) =>
          prev.map((tab, index) =>
            index === activeTab
              ? {
                  ...tab,
                  sql,
                  results: null,
                  error: `Error executing query:\n${sql}\n\n${error.toString()}`,
                  isExecuting: false,
                  executionTime,
                }
              : tab,
          ),
        );
      }
    },
    [tabs, activeTab],
  );

  // Clear results for current tab
  const handleClear = useCallback(() => {
    setTabs((prev) =>
      prev.map((tab, index) =>
        index === activeTab ? { ...tab, results: null, error: null } : tab,
      ),
    );
  }, [activeTab]);

  // Show query history
  const handleShowHistory = useCallback(async () => {
    const currentTab = tabs[activeTab];
    if (!currentTab) return;

    try {
      const history = await invoke("get_query_history", {
        serverId: currentTab.serverId,
      });
      console.log("Query history:", history);
      // TODO: Show history in a dialog or panel
    } catch (error) {
      console.error("Failed to load query history:", error);
    }
  }, [tabs, activeTab]);

  const currentTab = tabs[activeTab];

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
                        {tab.serverName || "Query"} #{index + 1}
                      </span>
                      <IconButton
                        size="small"
                        onClick={(e) => handleCloseTab(tab.id, e)}
                        sx={{
                          padding: 0,
                          "&:hover": {
                            backgroundColor: "action.hover",
                          },
                        }}
                      >
                        <Close fontSize="small" />
                      </IconButton>
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
              serverId={currentTab.serverId}
              serverName={currentTab.serverName}
              onExecute={handleExecute}
              onClear={handleClear}
              onShowHistory={handleShowHistory}
              isExecuting={currentTab.isExecuting}
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
    </Box>
  );
});

RightPanel.displayName = "RightPanel";

export default RightPanel;
