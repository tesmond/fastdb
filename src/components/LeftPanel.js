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
} from "@mui/material";
import {
  ExpandLess,
  ExpandMore,
  Storage,
  TableChart,
  ViewColumn,
} from "@mui/icons-material";
import { invoke } from "@tauri-apps/api/tauri";

function LeftPanel({
  servers,
  schemas,
  onServerSelect,
  selectedServer,
  onAddServer,
}) {
  const [expandedServers, setExpandedServers] = useState(new Set());
  const [expandedSchemas, setExpandedSchemas] = useState(new Set());
  const [expandedTables, setExpandedTables] = useState(new Set());
  const [tables, setTables] = useState({});
  const [columns, setColumns] = useState({});
  const [loadingTables, setLoadingTables] = useState(new Set());
  const [loadingColumns, setLoadingColumns] = useState(new Set());

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

  const handleSchemaClick = async (schemaId) => {
    const wasExpanded = expandedSchemas.has(schemaId);
    setExpandedSchemas((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(schemaId)) {
        newSet.delete(schemaId);
      } else {
        newSet.add(schemaId);
      }
      return newSet;
    });

    if (!wasExpanded && !tables[schemaId]) {
      setLoadingTables((prev) => new Set(prev).add(schemaId));
      try {
        const tableList = await invoke("get_tables", { schemaId });
        setTables((prev) => ({ ...prev, [schemaId]: tableList }));
      } catch (error) {
        console.error("Failed to load tables:", error);
      } finally {
        setLoadingTables((prev) => {
          const newSet = new Set(prev);
          newSet.delete(schemaId);
          return newSet;
        });
      }
    }
  };

  const handleTableClick = async (tableId) => {
    const wasExpanded = expandedTables.has(tableId);
    setExpandedTables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tableId)) {
        newSet.delete(tableId);
      } else {
        newSet.add(tableId);
      }
      return newSet;
    });

    if (!wasExpanded && !columns[tableId]) {
      setLoadingColumns((prev) => new Set(prev).add(tableId));
      try {
        const columnList = await invoke("get_columns", { tableId });
        setColumns((prev) => ({ ...prev, [tableId]: columnList }));
      } catch (error) {
        console.error("Failed to load columns:", error);
      } finally {
        setLoadingColumns((prev) => {
          const newSet = new Set(prev);
          newSet.delete(tableId);
          return newSet;
        });
      }
    }
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
              <ListItemButton onClick={() => handleServerClick(server)}>
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
                {schemas
                  .filter((schema) => schema.server_id === server.id)
                  .map((schema) => (
                    <React.Fragment key={schema.id}>
                      <ListItemButton
                        sx={{ pl: 4 }}
                        onClick={() => handleSchemaClick(schema.id)}
                      >
                        <ListItemText primary={schema.name} />
                        {expandedSchemas.has(schema.id) ? (
                          <ExpandLess />
                        ) : (
                          <ExpandMore />
                        )}
                      </ListItemButton>
                      <Collapse
                        in={expandedSchemas.has(schema.id)}
                        timeout="auto"
                        unmountOnExit
                      >
                        <List component="div" disablePadding>
                          {loadingTables.has(schema.id) ? (
                            <ListItem sx={{ pl: 6 }}>
                              <CircularProgress size={20} sx={{ mr: 1 }} />
                              <ListItemText primary="Loading tables..." />
                            </ListItem>
                          ) : (
                            (tables[schema.id] || []).map((table) => (
                              <React.Fragment key={table.id}>
                                <ListItemButton
                                  sx={{ pl: 6 }}
                                  onClick={() => handleTableClick(table.id)}
                                >
                                  <TableChart sx={{ mr: 1 }} />
                                  <ListItemText
                                    primary={table.name}
                                    secondary={table.type_}
                                  />
                                  {expandedTables.has(table.id) ? (
                                    <ExpandLess />
                                  ) : (
                                    <ExpandMore />
                                  )}
                                </ListItemButton>
                                <Collapse
                                  in={expandedTables.has(table.id)}
                                  timeout="auto"
                                  unmountOnExit
                                >
                                  <List component="div" disablePadding>
                                    {loadingColumns.has(table.id) ? (
                                      <ListItem sx={{ pl: 8 }}>
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
                                            sx={{ pl: 8 }}
                                          >
                                            <ViewColumn sx={{ mr: 1 }} />
                                            <ListItemText
                                              primary={column.name}
                                              secondary={`${column.data_type}${column.nullable ? "" : " NOT NULL"}`}
                                            />
                                          </ListItem>
                                        ),
                                      )
                                    )}
                                  </List>
                                </Collapse>
                              </React.Fragment>
                            ))
                          )}
                        </List>
                      </Collapse>
                    </React.Fragment>
                  ))}
              </List>
            </Collapse>
          </React.Fragment>
        ))}
      </List>
    </Box>
  );
}

export default LeftPanel;
