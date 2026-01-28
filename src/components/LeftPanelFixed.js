import React, { useState } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Collapse,
  Typography,
  Divider,
  CircularProgress,
  Button,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  ExpandLess,
  ExpandMore,
  Storage,
  TableChart,
  ViewColumn,
  Visibility,
  ListAlt,
} from "@mui/icons-material";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";

function LeftPanelFixed({
  servers,
  schemas,
  onServerSelect,
  selectedServer,
  onAddServer,
  onRefreshServer,
}) {
  const [expandedServers, setExpandedServers] = useState(new Set());
  const [expandedDatabases, setExpandedDatabases] = useState(new Set());
  const [expandedSchemas, setExpandedSchemas] = useState(new Set());
  const [expandedTables, setExpandedTables] = useState(new Set());
  const [expandedViews, setExpandedViews] = useState(new Set());
  const [expandedColumns, setExpandedColumns] = useState(new Set());
  const [expandedIndexes, setExpandedIndexes] = useState(new Set());
  const [tables, setTables] = useState({});
  const [columns, setColumns] = useState({});
  const [indexes, setIndexes] = useState({});
  const [views, setViews] = useState({});
  const [loadingTables, setLoadingTables] = useState(new Set());
  const [loadingColumns, setLoadingColumns] = useState(new Set());
  const [loadingIndexes, setLoadingIndexes] = useState(new Set());
  const [loadingViews, setLoadingViews] = useState(new Set());
  const [serverMenuState, setServerMenuState] = useState(null);
  const [schemaMenuState, setSchemaMenuState] = useState(null);
  const [tableMenuState, setTableMenuState] = useState(null);
  const [databaseMenuState, setDatabaseMenuState] = useState(null);

  const getDatabaseName = (schema, server) =>
    schema.database_name || server.database || "";

  const getSchemaKey = (schema, server) =>
    `${server.id}:${getDatabaseName(schema, server)}:${schema.name}`;

  const getTableKey = (schema, server, table) =>
    `${getSchemaKey(schema, server)}:${table.name}`;

  const handleServerClick = (server) => {
    onServerSelect(server);
    setExpandedServers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(server.id)) {
        newSet.delete(server.id);
      } else {
        newSet.add(server.id);
      }
      return newSet;
    });
  };

  const handleServerContextMenu = (event, server) => {
    event.preventDefault();
    setServerMenuState({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      server,
    });
  };

  const handleCloseServerMenu = () => {
    setServerMenuState(null);
  };

  const handleSchemaContextMenu = (event, schema, server) => {
    event.preventDefault();
    event.stopPropagation();
    setSchemaMenuState({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      schema,
      server,
    });
  };

  const handleCloseSchemaMenu = () => {
    setSchemaMenuState(null);
  };

  const handleDatabaseContextMenu = (event, server, databaseName) => {
    event.preventDefault();
    event.stopPropagation();
    setDatabaseMenuState({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      server,
      databaseName,
    });
  };

  const handleCloseDatabaseMenu = () => {
    setDatabaseMenuState(null);
  };

  const handleTableContextMenu = (event, table, schema, server) => {
    event.preventDefault();
    event.stopPropagation();
    setTableMenuState({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      table,
      schema,
      server,
    });
  };

  const handleCloseTableMenu = () => {
    setTableMenuState(null);
  };

  const handleExportTable = () => {
    if (!tableMenuState?.table || !tableMenuState?.schema || !tableMenuState?.server) return;

    window.dispatchEvent(
      new CustomEvent("open-export-table-tab", {
        detail: {
          server: tableMenuState.server,
          schema: tableMenuState.schema,
          table: tableMenuState.table,
        },
      }),
    );

    handleCloseTableMenu();
  };

  const handleQueryTable = () => {
    if (!tableMenuState?.table || !tableMenuState?.schema || !tableMenuState?.server) return;

    window.dispatchEvent(
      new CustomEvent("open-query-table-tab", {
        detail: {
          server: tableMenuState.server,
          schema: tableMenuState.schema,
          table: tableMenuState.table,
        },
      }),
    );

    handleCloseTableMenu();
  };

  const handleExportSchema = () => {
    if (!schemaMenuState?.schema || !schemaMenuState?.server) return;

    window.dispatchEvent(
      new CustomEvent("open-export-schema-tab", {
        detail: {
          server: schemaMenuState.server,
          schema: schemaMenuState.schema,
        },
      }),
    );

    handleCloseSchemaMenu();
  };

  const handleQuerySchema = () => {
    if (!schemaMenuState?.schema || !schemaMenuState?.server) return;

    window.dispatchEvent(
      new CustomEvent("open-query-schema-tab", {
        detail: {
          server: schemaMenuState.server,
          schema: schemaMenuState.schema,
        },
      }),
    );

    handleCloseSchemaMenu();
  };

  const handleRefreshServer = async () => {
    if (serverMenuState?.server && onRefreshServer) {
      await onRefreshServer(serverMenuState.server);
    }
    handleCloseServerMenu();
  };

  const handleRunSqlFromFile = async () => {
    const server = serverMenuState?.server;
    if (!server) return;

    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SQL Files", extensions: ["sql"] }],
      });

      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) {
        handleCloseServerMenu();
        return;
      }

      const metadata = await invoke("get_sql_file_metadata", { filePath });

      window.dispatchEvent(
        new CustomEvent("open-sql-file-tab", {
          detail: {
            server,
            file: metadata,
          },
        }),
      );
    } catch (error) {
      console.error("Failed to open SQL file:", error);
    }

    handleCloseServerMenu();
  };

  const handleOpenDashboard = () => {
    const server = serverMenuState?.server;
    if (!server) return;

    window.dispatchEvent(
      new CustomEvent("open-dashboard-tab", {
        detail: {
          server,
        },
      }),
    );

    handleCloseServerMenu();
  };

  const handleQueryDatabase = () => {
    if (!databaseMenuState?.server) return;

    window.dispatchEvent(
      new CustomEvent("open-query-database-tab", {
        detail: {
          server: databaseMenuState.server,
          databaseName: databaseMenuState.databaseName,
        },
      }),
    );

    handleCloseDatabaseMenu();
  };

  const handleDatabaseClick = (serverId, databaseName) => {
    const databaseKey = `${serverId}:${databaseName}`;
    setExpandedDatabases((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(databaseKey)) {
        newSet.delete(databaseKey);
      } else {
        newSet.add(databaseKey);
      }
      return newSet;
    });
  };

  const handleSchemaClick = async (schema, server) => {
    const schemaKey = getSchemaKey(schema, server);
    const wasExpanded = expandedSchemas.has(schemaKey);
    setExpandedSchemas((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(schemaKey)) {
        newSet.delete(schemaKey);
      } else {
        newSet.add(schemaKey);
      }
      return newSet;
    });

    if (!wasExpanded && !tables[schema.id]) {
      setLoadingTables((prev) => new Set(prev).add(schema.id));
      try {
        const tableList = await invoke("get_tables", { schemaId: schema.id });
        setTables((prev) => ({ ...prev, [schema.id]: tableList }));
      } catch (error) {
        console.error("Failed to load tables:", error);
      } finally {
        setLoadingTables((prev) => {
          const newSet = new Set(prev);
          newSet.delete(schema.id);
          return newSet;
        });
      }
    }

    if (!wasExpanded && !views[schema.id]) {
      setLoadingViews((prev) => new Set(prev).add(schema.id));
      try {
        const viewList = await invoke("get_views", { schemaId: schema.id });
        setViews((prev) => ({ ...prev, [schema.id]: viewList }));
      } catch (error) {
        console.error("Failed to load views:", error);
      } finally {
        setLoadingViews((prev) => {
          const newSet = new Set(prev);
          newSet.delete(schema.id);
          return newSet;
        });
      }
    }
  };

  const handleTableClick = async (table, schema, server) => {
    const tableKey = getTableKey(schema, server, table);
    const wasExpanded = expandedTables.has(tableKey);
    setExpandedTables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tableKey)) {
        newSet.delete(tableKey);
      } else {
        newSet.add(tableKey);
      }
      return newSet;
    });

    if (!wasExpanded && !indexes[table.id]) {
      setLoadingIndexes((prev) => new Set(prev).add(table.id));
      try {
        const indexList = await invoke("get_indexes", { tableId: table.id });
        setIndexes((prev) => ({ ...prev, [table.id]: indexList }));
      } catch (error) {
        console.error("Failed to load indexes:", error);
      } finally {
        setLoadingIndexes((prev) => {
          const newSet = new Set(prev);
          newSet.delete(table.id);
          return newSet;
        });
      }
    }
  };

  const handleColumnsClick = async (table, schema, server) => {
    const tableKey = getTableKey(schema, server, table);
    const wasExpanded = expandedColumns.has(tableKey);
    setExpandedColumns((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tableKey)) {
        newSet.delete(tableKey);
      } else {
        newSet.add(tableKey);
      }
      return newSet;
    });

    if (!wasExpanded && !columns[table.id]) {
      setLoadingColumns((prev) => new Set(prev).add(table.id));
      try {
        const columnList = await invoke("get_columns", { tableId: table.id });
        setColumns((prev) => ({ ...prev, [table.id]: columnList }));
      } catch (error) {
        console.error("Failed to load columns:", error);
      } finally {
        setLoadingColumns((prev) => {
          const newSet = new Set(prev);
          newSet.delete(table.id);
          return newSet;
        });
      }
    }
  };

  const handleIndexesClick = async (table, schema, server) => {
    const tableKey = getTableKey(schema, server, table);
    const wasExpanded = expandedIndexes.has(tableKey);
    setExpandedIndexes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tableKey)) {
        newSet.delete(tableKey);
      } else {
        newSet.add(tableKey);
      }
      return newSet;
    });

    if (!wasExpanded && !indexes[table.id]) {
      setLoadingIndexes((prev) => new Set(prev).add(table.id));
      try {
        const indexList = await invoke("get_indexes", { tableId: table.id });
        setIndexes((prev) => ({ ...prev, [table.id]: indexList }));
      } catch (error) {
        console.error("Failed to load indexes:", error);
      } finally {
        setLoadingIndexes((prev) => {
          const newSet = new Set(prev);
          newSet.delete(table.id);
          return newSet;
        });
      }
    }
  };

  const handleViewsClick = (schema, server) => {
    const schemaKey = getSchemaKey(schema, server);
    setExpandedViews((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(schemaKey)) {
        newSet.delete(schemaKey);
      } else {
        newSet.add(schemaKey);
      }
      return newSet;
    });
  };

  return (
    <Box
      sx={{
        width: 300,
        borderRight: 1,
        borderColor: "divider",
        overflowY: "auto",
      }}
    >
      <Typography variant="h6" sx={{ p: 2 }}>
        Servers
        <Button variant="contained" onClick={onAddServer} sx={{ m: 2 }}>
          Add Server
        </Button>
      </Typography>
      <Divider />
      <List>
        {servers.map((server) => (
          <React.Fragment key={server.id}>
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => handleServerClick(server)}
                onContextMenu={(event) => handleServerContextMenu(event, server)}
              >
                <Storage sx={{ mr: 1 }} />
                <ListItemText primary={server.name} secondary={server.host} />
                {expandedServers.has(server.id) ? (
                  <ExpandLess />
                ) : (
                  <ExpandMore />
                )}
              </ListItemButton>
            </ListItem>
            <Collapse
              in={expandedServers.has(server.id)}
              timeout="auto"
              unmountOnExit
            >
              <List component="div" disablePadding>
                {Array.from(
                  new Set(
                    schemas
                      .filter((schema) => schema.server_id === server.id)
                      .map((schema) => getDatabaseName(schema, server))
                  )
                ).map((databaseName) => {
                  const databaseKey = `${server.id}:${databaseName}`;
                  const displayDatabaseName =
                    databaseName || server.database || "(default)";
                  return (
                    <React.Fragment key={databaseKey}>
                      <ListItemButton
                        sx={{ pl: 4 }}
                        onClick={() =>
                          handleDatabaseClick(server.id, databaseName)
                        }
                        onContextMenu={(event) => handleDatabaseContextMenu(event, server, databaseName)}
                      >
                        <Storage sx={{ mr: 1 }} />
                        <ListItemText primary={displayDatabaseName} secondary="database" />
                        {expandedDatabases.has(databaseKey) ? (
                          <ExpandLess />
                        ) : (
                          <ExpandMore />
                        )}
                      </ListItemButton>
                      <Collapse
                        in={expandedDatabases.has(databaseKey)}
                        timeout="auto"
                        unmountOnExit
                      >
                        <List component="div" disablePadding>
                          {schemas
                            .filter(
                              (schema) =>
                                schema.server_id === server.id &&
                                getDatabaseName(schema, server) ===
                                  databaseName
                            )
                            .map((schema) => {
                              const schemaKey = getSchemaKey(schema, server);
                              return (
                                <React.Fragment key={schema.id}>
                                  <ListItemButton
                                    sx={{ pl: 6 }}
                                    onClick={() =>
                                      handleSchemaClick(schema, server)
                                    }
                                    onContextMenu={(event) =>
                                      handleSchemaContextMenu(
                                        event,
                                        schema,
                                        server,
                                      )
                                    }
                                  >
                                    <ListItemText primary={schema.name} secondary="schema" />
                                    {expandedSchemas.has(schemaKey) ? (
                                      <ExpandLess />
                                    ) : (
                                      <ExpandMore />
                                    )}
                                  </ListItemButton>
                                  <Collapse
                                    in={expandedSchemas.has(schemaKey)}
                                    timeout="auto"
                                    unmountOnExit
                                  >
                                    <List component="div" disablePadding>
                                      {loadingTables.has(schema.id) ? (
                                        <ListItem sx={{ pl: 8 }}>
                                          <CircularProgress
                                            size={20}
                                            sx={{ mr: 1 }}
                                          />
                                          <ListItemText primary="Loading tables..." />
                                        </ListItem>
                                      ) : (
                                        (tables[schema.id] || []).map(
                                          (table) => {
                                            const tableKey = getTableKey(
                                              schema,
                                              server,
                                              table
                                            );
                                            return (
                                              <React.Fragment key={table.id}>
                                                <ListItemButton
                                                  sx={{ pl: 8 }}
                                                  onClick={() =>
                                                    handleTableClick(
                                                      table,
                                                      schema,
                                                      server
                                                    )
                                                  }
                                                  onContextMenu={(event) =>
                                                    handleTableContextMenu(
                                                      event,
                                                      table,
                                                      schema,
                                                      server,
                                                    )
                                                  }
                                                >
                                                  <TableChart sx={{ mr: 1 }} />
                                                  <ListItemText
                                                    primary={table.name}
                                                    secondary="table"
                                                  />
                                                  {expandedTables.has(tableKey) ? (
                                                    <ExpandLess />
                                                  ) : (
                                                    <ExpandMore />
                                                  )}
                                                </ListItemButton>
                                                <Collapse
                                                  in={expandedTables.has(tableKey)}
                                                  timeout="auto"
                                                  unmountOnExit
                                                >
                                                  <List component="div" disablePadding>
                                                    <ListItemButton
                                                      sx={{ pl: 10 }}
                                                      onClick={() =>
                                                        handleColumnsClick(
                                                          table,
                                                          schema,
                                                          server
                                                        )
                                                      }
                                                    >
                                                      <ViewColumn sx={{ mr: 1 }} />
                                                      <ListItemText primary="Columns" />
                                                      {expandedColumns.has(tableKey) ? (
                                                        <ExpandLess />
                                                      ) : (
                                                        <ExpandMore />
                                                      )}
                                                    </ListItemButton>
                                                    <Collapse
                                                      in={expandedColumns.has(tableKey)}
                                                      timeout="auto"
                                                      unmountOnExit
                                                    >
                                                      <List component="div" disablePadding>
                                                        {loadingColumns.has(table.id) ? (
                                                          <ListItem sx={{ pl: 12 }}>
                                                            <CircularProgress
                                                              size={16}
                                                              sx={{ mr: 1 }}
                                                            />
                                                            <ListItemText primary="Loading columns..." />
                                                          </ListItem>
                                                        ) : (
                                                          (columns[table.id] || []).map(
                                                            (column) => (
                                                              <ListItem
                                                                key={column.id}
                                                                sx={{ pl: 12 }}
                                                              >
                                                                <ViewColumn sx={{ mr: 1 }} />
                                                                <ListItemText
                                                                  primary={column.name}
                                                                  secondary={`${column.data_type}${column.nullable ? "" : " NOT NULL"}`}
                                                                />
                                                              </ListItem>
                                                            )
                                                          )
                                                        )}
                                                      </List>
                                                    </Collapse>

                                                    {(() => {
                                                      const indexList = indexes[table.id];
                                                      const isIndexesLoaded =
                                                        Array.isArray(indexList);
                                                      const hasIndexes =
                                                        isIndexesLoaded && indexList.length > 0;
                                                      const isIndexesEmpty =
                                                        isIndexesLoaded && indexList.length === 0;
                                                      const isIndexesLoading = loadingIndexes.has(table.id);
                                                      const disableIndexes = isIndexesEmpty || isIndexesLoading;

                                                      return (
                                                        <ListItemButton
                                                          sx={{
                                                            pl: 10,
                                                            color: disableIndexes
                                                              ? "text.disabled"
                                                              : "text.primary",
                                                          }}
                                                          disabled={disableIndexes}
                                                          onClick={() =>
                                                            handleIndexesClick(
                                                              table,
                                                              schema,
                                                              server
                                                            )
                                                          }
                                                        >
                                                          <ListAlt
                                                            sx={{
                                                              mr: 1,
                                                              color: disableIndexes
                                                                ? "text.disabled"
                                                                : "text.secondary",
                                                            }}
                                                          />
                                                          <ListItemText primary="Indexes" />
                                                          {expandedIndexes.has(tableKey) ? (
                                                            <ExpandLess />
                                                          ) : (
                                                            <ExpandMore />
                                                          )}
                                                        </ListItemButton>
                                                      );
                                                    })()}
                                                    <Collapse
                                                      in={expandedIndexes.has(tableKey)}
                                                      timeout="auto"
                                                      unmountOnExit
                                                    >
                                                      <List component="div" disablePadding>
                                                        {loadingIndexes.has(table.id) ? (
                                                          <ListItem sx={{ pl: 12 }}>
                                                            <CircularProgress
                                                              size={16}
                                                              sx={{ mr: 1 }}
                                                            />
                                                            <ListItemText primary="Loading indexes..." />
                                                          </ListItem>
                                                        ) : (
                                                          (indexes[table.id] || []).map(
                                                            (index) => (
                                                              <ListItem
                                                                key={index.id}
                                                                sx={{ pl: 12 }}
                                                              >
                                                                <ListAlt sx={{ mr: 1 }} />
                                                                <ListItemText
                                                                  primary={index.name}
                                                                  secondary={index.definition}
                                                                />
                                                              </ListItem>
                                                            )
                                                          )
                                                        )}
                                                      </List>
                                                    </Collapse>
                                                  </List>
                                                </Collapse>
                                              </React.Fragment>
                                            );
                                          }
                                        )
                                      )}

                                      {(() => {
                                        const viewList = views[schema.id] || [];
                                        const hasViews = viewList.length > 0;
                                        const isViewsEmpty =
                                          !loadingViews.has(schema.id) && !hasViews;
                                        const schemaKey = getSchemaKey(schema, server);
                                        const isViewsLoading = loadingViews.has(schema.id);
                                        const disableViews = isViewsEmpty || isViewsLoading;

                                        return (
                                          <>
                                            <ListItemButton
                                              sx={{
                                                pl: 8,
                                                color: disableViews
                                                  ? "text.disabled"
                                                  : "text.primary",
                                              }}
                                              disabled={disableViews}
                                              onClick={() =>
                                                handleViewsClick(schema, server)
                                              }
                                            >
                                              <Visibility
                                                sx={{
                                                  mr: 1,
                                                  color: disableViews
                                                    ? "text.disabled"
                                                    : "text.secondary",
                                                }}
                                              />
                                              <ListItemText primary="Views" />
                                              {expandedViews.has(schemaKey) ? (
                                                <ExpandLess />
                                              ) : (
                                                <ExpandMore />
                                              )}
                                            </ListItemButton>
                                            <Collapse
                                              in={expandedViews.has(schemaKey)}
                                              timeout="auto"
                                              unmountOnExit
                                            >
                                              <List component="div" disablePadding>
                                                {isViewsLoading ? (
                                                  <ListItem sx={{ pl: 10 }}>
                                                    <CircularProgress
                                                      size={16}
                                                      sx={{ mr: 1 }}
                                                    />
                                                    <ListItemText primary="Loading views..." />
                                                  </ListItem>
                                                ) : (
                                                  viewList.map((view) => (
                                                    <ListItem key={view.id} sx={{ pl: 10 }}>
                                                      <Visibility sx={{ mr: 1 }} />
                                                      <ListItemText primary={view.name} />
                                                    </ListItem>
                                                  ))
                                                )}
                                              </List>
                                            </Collapse>
                                          </>
                                        );
                                      })()}
                                    </List>
                                  </Collapse>
                                </React.Fragment>
                              );
                            })}
                        </List>
                      </Collapse>
                    </React.Fragment>
                  );
                })}
              </List>
            </Collapse>
          </React.Fragment>
        ))}
      </List>
      <Menu
        open={Boolean(serverMenuState)}
        onClose={handleCloseServerMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          serverMenuState
            ? { top: serverMenuState.mouseY, left: serverMenuState.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleRefreshServer}>Refresh schema</MenuItem>
        <MenuItem onClick={handleOpenDashboard}>Open dashboard</MenuItem>
        <MenuItem onClick={handleRunSqlFromFile}>Run SQL from file...</MenuItem>
      </Menu>
      <Menu
        open={Boolean(schemaMenuState)}
        onClose={handleCloseSchemaMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          schemaMenuState
            ? { top: schemaMenuState.mouseY, left: schemaMenuState.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleQuerySchema}>Query schema</MenuItem>
        <MenuItem onClick={handleExportSchema}>Export SQL...</MenuItem>
      </Menu>

      <Menu
        open={Boolean(databaseMenuState)}
        onClose={handleCloseDatabaseMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          databaseMenuState
            ? { top: databaseMenuState.mouseY, left: databaseMenuState.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleQueryDatabase}>Query database</MenuItem>
      </Menu>

      <Menu
        open={Boolean(tableMenuState)}
        onClose={handleCloseTableMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          tableMenuState
            ? { top: tableMenuState.mouseY, left: tableMenuState.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleQueryTable}>Query table</MenuItem>
        <MenuItem onClick={handleExportTable}>Export SQL...</MenuItem>
      </Menu>
    </Box>
  );
}

export default LeftPanelFixed;
