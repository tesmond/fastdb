import React, { useState, useCallback, memo, useEffect, useRef } from "react";
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
  Checkbox,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/api/dialog";
import QueryEditor from "./QueryEditor";
import ResultViewer from "./ResultViewer";
import QueryHistory from "./QueryHistory";

export const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined) return "Unknown";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  const raw = value.toFixed(value >= 10 || i === 0 ? 0 : 1);
  const formatted = raw.endsWith(".0") ? raw.slice(0, -2) : raw;
  return `${formatted} ${sizes[i]}`;
};

const RightPanel = memo(({ selectedServer, onSchemaRefresh }) => {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState({
    tables: [],
    columns: [],
    indexes: [],
    schemas: [],
  });

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
      setAutocompleteItems({ tables: [], columns: [], indexes: [], schemas: [] });
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

  useEffect(() => {
    const handleOpenExportSchemaTab = (event) => {
      const { server, schema } = event.detail || {};
      if (!server || !schema) return;

      const newTab = {
        id: Date.now(),
        type: "export",
        serverId: server.id,
        serverName: server.name,
        schemaName: schema.name,
        schemaId: schema.id,
        includeData: false,
        exportPath: null,
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

    window.addEventListener("open-export-schema-tab", handleOpenExportSchemaTab);
    return () => {
      window.removeEventListener("open-export-schema-tab", handleOpenExportSchemaTab);
    };
  }, []);

  useEffect(() => {
    const handleOpenExportTableTab = (event) => {
      const { server, schema, table } = event.detail || {};
      if (!server || !schema || !table) return;

      const newTab = {
        id: Date.now(),
        type: "export-table",
        serverId: server.id,
        serverName: server.name,
        schemaName: schema.name,
        schemaId: schema.id,
        tableName: table.name,
        includeData: false,
        exportPath: null,
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

    window.addEventListener("open-export-table-tab", handleOpenExportTableTab);
    return () => {
      window.removeEventListener("open-export-table-tab", handleOpenExportTableTab);
    };
  }, []);

  useEffect(() => {
    const handleOpenQuerySchemaTab = (event) => {
      const { server, schema } = event.detail || {};
      if (!server || !schema) return;

      const newTab = {
        id: Date.now(),
        type: "query",
        serverId: server.id,
        serverName: server.name,
        databaseName: schema.database_name || server.database || null,
        schemaName: schema.name,
        sql: "",
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

    window.addEventListener("open-query-schema-tab", handleOpenQuerySchemaTab);
    return () => {
      window.removeEventListener("open-query-schema-tab", handleOpenQuerySchemaTab);
    };
  }, []);

  // Open a query tab scoped to a database (no default schema)
  useEffect(() => {
    const handleOpenQueryDatabaseTab = (event) => {
      const { server, databaseName } = event.detail || {};
      if (!server) return;

      const newTab = {
        id: Date.now(),
        type: "query",
        serverId: server.id,
        serverName: server.name,
        databaseName: databaseName || server.database || null,
        sql: "",
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

    window.addEventListener("open-query-database-tab", handleOpenQueryDatabaseTab);
    return () => {
      window.removeEventListener("open-query-database-tab", handleOpenQueryDatabaseTab);
    };
  }, []);

  // Open a query tab for a specific table and default the schema and a sample SELECT
  useEffect(() => {
    const handleOpenQueryTableTab = (event) => {
      const { server, schema, table } = event.detail || {};
      if (!server || !schema || !table) return;

      const newTab = {
        id: Date.now(),
        type: "query",
        serverId: server.id,
        serverName: server.name,
        databaseName: schema.database_name || server.database || null,
        schemaName: schema.name,
        sql: `SELECT * FROM ${schema.name}.${table.name} LIMIT 100;`,
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

    window.addEventListener("open-query-table-tab", handleOpenQueryTableTab);
    return () => {
      window.removeEventListener("open-query-table-tab", handleOpenQueryTableTab);
    };
  }, []);

  useEffect(() => {
    const handleOpenDashboardTab = (event) => {
      const { server } = event.detail || {};
      if (!server) return;

      const newTab = {
        id: Date.now(),
        type: "dashboard",
        serverId: server.id,
        serverName: server.name,
        databaseName: server.database || null,
      };

      setTabs((prev) => {
        const newTabs = [...prev, newTab];
        setActiveTab(newTabs.length - 1);
        return newTabs;
      });
    };

    window.addEventListener("open-dashboard-tab", handleOpenDashboardTab);
    return () => {
      window.removeEventListener("open-dashboard-tab", handleOpenDashboardTab);
    };
  }, []);

  const DashboardPanel = ({ serverId, serverName, databaseName }) => {
    const [activeConnections, setActiveConnections] = useState(null);
    const [transactionsPerSecond, setTransactionsPerSecond] = useState(null);
    const [connections, setConnections] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const lastSampleRef = useRef({ totalTransactions: null, timestamp: null });
    const tpsHistoryRef = useRef([]);
    const maxHistoryMs = 15 * 60 * 1000;

    const loadMetrics = useCallback(async () => {
      try {
        const result = await invoke("get_dashboard_metrics", { serverId });
        const now = Date.now();
        const totalTransactions = result?.totalTransactions ?? null;

        setActiveConnections(result?.activeConnections ?? null);
        setConnections(result?.connections || []);

        if (
          lastSampleRef.current.totalTransactions !== null &&
          lastSampleRef.current.timestamp !== null &&
          totalTransactions !== null
        ) {
          const elapsedSeconds =
            (now - lastSampleRef.current.timestamp) / 1000;
          const delta = totalTransactions - lastSampleRef.current.totalTransactions;
          const tps = elapsedSeconds > 0 ? delta / elapsedSeconds : 0;
          setTransactionsPerSecond(tps);
          tpsHistoryRef.current = [
            ...tpsHistoryRef.current,
            { timestamp: now, value: tps },
          ].filter((point) => now - point.timestamp <= maxHistoryMs);
        }

        lastSampleRef.current = {
          totalTransactions,
          timestamp: now,
        };

        setLastUpdated(now);
        setError(null);
      } catch (err) {
        setError(err?.toString?.() || String(err));
      } finally {
        setIsLoading(false);
      }
    }, [serverId]);

    useEffect(() => {
      let isMounted = true;

      const run = async () => {
        if (!isMounted) return;
        await loadMetrics();
      };

      run();
      const interval = setInterval(run, 1000);

      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }, [loadMetrics]);

    const formatTps = (value) => {
      if (value === null || Number.isNaN(value)) return "–";
      return value.toFixed(2);
    };

    const history = tpsHistoryRef.current;
    const chartWidth = 900;
    const chartHeight = 180;
    const padding = 24;
    const points = history.map((point) => point.value);
    const maxValue = points.length > 0 ? Math.max(...points, 1) : 1;
    const minValue = 0;
    const timeStart = history.length > 0 ? history[0].timestamp : Date.now();
    const timeEnd = history.length > 0 ? history[history.length - 1].timestamp : Date.now();
    const timeSpan = Math.max(timeEnd - timeStart, 1);
    const getX = (timestamp) =>
      padding + ((timestamp - timeStart) / timeSpan) * (chartWidth - padding * 2);
    const getY = (value) =>
      padding + ((maxValue - value) / (maxValue - minValue || 1)) * (chartHeight - padding * 2);
    const path = history
      .map((point, index) =>
        `${index === 0 ? "M" : "L"} ${getX(point.timestamp)} ${getY(point.value)}`,
      )
      .join(" ");

    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          p: 2,
          overflow: "auto",
        }}
      >
        <Box>
          <Typography variant="h6">Dashboard</Typography>
          <Typography variant="caption" color="text.secondary">
            {serverName}
            {databaseName ? ` • ${databaseName}` : ""}
          </Typography>
        </Box>

        {error ? (
          <Paper sx={{ p: 2, border: 1, borderColor: "error.main" }}>
            <Typography color="error">{error}</Typography>
          </Paper>
        ) : null}

        <Paper
          sx={{
            border: 1,
            borderColor: "divider",
            p: 2,
          }}
        >
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Transactions per second (last 15 minutes)
          </Typography>
          <Box sx={{ width: "100%", overflowX: "auto" }}>
            <svg
              width="100%"
              height={chartHeight}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
            >
              <rect
                x="0"
                y="0"
                width={chartWidth}
                height={chartHeight}
                fill="#fafafa"
                stroke="#e0e0e0"
              />
              {history.length > 1 ? (
                <path d={path} fill="none" stroke="#1976d2" strokeWidth="2" />
              ) : null}
            </svg>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Current TPS: {isLoading ? "…" : formatTps(transactionsPerSecond)}
          </Typography>
        </Paper>

        <Paper
          sx={{
            border: 1,
            borderColor: "divider",
            p: 2,
          }}
        >
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Active connections ({isLoading ? "…" : activeConnections ?? "–"})
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Executing SQL</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {connections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} align="center">
                    {isLoading ? "Loading..." : "No active connections"}
                  </TableCell>
                </TableRow>
              ) : (
                connections.map((connection, index) => (
                  <TableRow key={`${connection.user}-${index}`}>
                    <TableCell>{connection.user}</TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {connection.query}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Paper>

        <Typography variant="caption" color="text.secondary">
          {lastUpdated
            ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}`
            : ""}
        </Typography>
      </Box>
    );
  };

  // Create a new query tab
  const handleNewTab = useCallback(() => {
    if (!selectedServer) return;

    const newTab = {
      id: Date.now(),
      type: "query",
      serverId: selectedServer.id,
      serverName: selectedServer.name,
      databaseName: selectedServer.database || null,
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
          schemaName: currentTab.schemaName || null,
          databaseName: currentTab.databaseName || null,
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
      databaseName: selectedServer.database || null,
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

  const handleExportSchema = useCallback(async () => {
    const active = tabs[activeTab];
    if (!active || active.type !== "export") return;

    const path = await save({
      filters: [{ name: "SQL Files", extensions: ["sql"] }],
    });

    if (!path) return;

    setTabs((prev) =>
      prev.map((tab, index) =>
        index === activeTab
          ? {
              ...tab,
              exportPath: path,
              isExecuting: true,
              error: null,
              results: null,
            }
          : tab,
      ),
    );

    const startTime = Date.now();

    try {
      const result = await invoke("export_schema_sql", {
        serverId: active.serverId,
        schemaName: active.schemaName,
        includeData: active.includeData,
        outputPath: path,
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
                executionTime,
              }
            : tab,
        ),
      );
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error?.toString?.() || String(error);

      setTabs((prev) =>
        prev.map((tab, index) =>
          index === activeTab
            ? {
                ...tab,
                isExecuting: false,
                error: `Error exporting schema:\n${active.schemaName}\n\n${errorMessage}`,
                executionTime,
              }
            : tab,
        ),
      );
    }
  }, [tabs, activeTab]);

  const handleExportTable = useCallback(async () => {
    const active = tabs[activeTab];
    if (!active || active.type !== "export-table") return;

    const path = await save({
      filters: [{ name: "SQL Files", extensions: ["sql"] }],
    });

    if (!path) return;

    setTabs((prev) =>
      prev.map((tab, index) =>
        index === activeTab
          ? {
              ...tab,
              exportPath: path,
              isExecuting: true,
              error: null,
              results: null,
            }
          : tab,
      ),
    );

    const startTime = Date.now();

    try {
      const result = await invoke("export_table_sql", {
        serverId: active.serverId,
        schemaName: active.schemaName,
        tableName: active.tableName,
        includeData: active.includeData,
        outputPath: path,
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
                executionTime,
              }
            : tab,
        ),
      );
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error?.toString?.() || String(error);

      setTabs((prev) =>
        prev.map((tab, index) =>
          index === activeTab
            ? {
                ...tab,
                isExecuting: false,
                error: `Error exporting table:\n${active.schemaName}.${active.tableName}\n\n${errorMessage}`,
                executionTime,
              }
            : tab,
        ),
      );
    }
  }, [tabs, activeTab]);

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
                          : tab.type === "export"
                            ? `Export ${tab.schemaName || "schema"}`
                            : tab.type === "export-table"
                              ? `Export ${tab.tableName || "table"}`
                              : tab.type === "dashboard"
                                ? `Dashboard ${tab.serverName || ""}`.trim()
                            : tab.schemaName || tab.databaseName
                              ? `${tab.serverName || "Query"} (${tab.databaseName ? `${tab.databaseName}${tab.schemaName ? `.${tab.schemaName}` : ""}` : tab.schemaName}) #${index + 1}`
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
          {currentTab.type === "export" ? (
            <>
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
                      <Typography variant="subtitle1">Export schema</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {currentTab.schemaName}
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      onClick={handleExportSchema}
                      disabled={currentTab.isExecuting}
                      startIcon={
                        currentTab.isExecuting ? (
                          <CircularProgress size={16} />
                        ) : null
                      }
                    >
                      Export SQL
                    </Button>
                  </Box>
                  <Divider />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(currentTab.includeData)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setTabs((prev) =>
                            prev.map((tab, index) =>
                              index === activeTab
                                ? { ...tab, includeData: checked }
                                : tab,
                            ),
                          );
                        }}
                      />
                    }
                    label="Include data"
                  />
                  <List dense sx={{ overflowY: "auto" }}>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Schema"
                        secondary={currentTab.schemaName}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Include data"
                        secondary={currentTab.includeData ? "Yes" : "No"}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Output path"
                        secondary={currentTab.exportPath || "Not selected"}
                      />
                    </ListItem>
                  </List>
                </Paper>
              </Box>

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
          ) : currentTab.type === "export-table" ? (
            <>
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
                      <Typography variant="subtitle1">Export table</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {currentTab.schemaName}.{currentTab.tableName}
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      onClick={handleExportTable}
                      disabled={currentTab.isExecuting}
                      startIcon={
                        currentTab.isExecuting ? (
                          <CircularProgress size={16} />
                        ) : null
                      }
                    >
                      Export SQL
                    </Button>
                  </Box>
                  <Divider />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(currentTab.includeData)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setTabs((prev) =>
                            prev.map((tab, index) =>
                              index === activeTab
                                ? { ...tab, includeData: checked }
                                : tab,
                            ),
                          );
                        }}
                      />
                    }
                    label="Include data"
                  />
                  <List dense sx={{ overflowY: "auto" }}>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Table"
                        secondary={`${currentTab.schemaName}.${currentTab.tableName}`}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Include data"
                        secondary={currentTab.includeData ? "Yes" : "No"}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Output path"
                        secondary={currentTab.exportPath || "Not selected"}
                      />
                    </ListItem>
                  </List>
                </Paper>
              </Box>

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
          ) : currentTab.type === "file" ? (
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
          ) : currentTab.type === "dashboard" ? (
            <DashboardPanel
              serverId={currentTab.serverId}
              serverName={currentTab.serverName}
              databaseName={currentTab.databaseName}
            />
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
