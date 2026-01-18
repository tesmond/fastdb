import React, { useState } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  export default LeftPanel;
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
                      >
                        <Storage sx={{ mr: 1 }} />
                        <ListItemText primary={displayDatabaseName} />
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
                                  databaseName,
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
                                  >
                                    <ListItemText primary={schema.name} />
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
                                              table,
                                            );
                                            return (
                                              <React.Fragment key={table.id}>
                                                <ListItemButton
                                                  sx={{ pl: 8 }}
                                                  onClick={() =>
                                                    handleTableClick(
                                                      table,
                                                      schema,
                                                      server,
                                                    )
                                                  }
                                                >
                                                  <TableChart sx={{ mr: 1 }} />
                                                  <ListItemText
                                                    primary={table.name}
                                                    secondary={table.type_}
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
                                                          server,
                                                        )
                                                      }
                                                    >
                                                      <ViewColumn sx={{ mr: 1 }} />
                                                      <ListItemText primary="Columns" />
                                                      {expandedColumns.has(
                                                        tableKey,
                                                      ) ? (
                                                        <ExpandLess />
                                                      ) : (
                                                        <ExpandMore />
                                                      )}
                                                    </ListItemButton>
                                                    <Collapse
                                                      in={expandedColumns.has(
                                                        tableKey,
                                                      )}
                                                      timeout="auto"
                                                      unmountOnExit
                                                    >
                                                      <List
                                                        component="div"
                                                        disablePadding
                                                      >
                                                        {loadingColumns.has(
                                                          table.id,
                                                        ) ? (
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
                                                            ),
                                                          )
                                                        )}
                                                      </List>
                                                    </Collapse>

                                                    <ListItemButton
                                                      sx={{ pl: 10 }}
                                                      onClick={() =>
                                                        handleIndexesClick(
                                                          table,
                                                          schema,
                                                          server,
                                                        )
                                                      }
                                                    >
                                                      <ListAlt sx={{ mr: 1 }} />
                                                      <ListItemText primary="Indexes" />
                                                      {expandedIndexes.has(
                                                        tableKey,
                                                      ) ? (
                                                        <ExpandLess />
                                                      ) : (
                                                        <ExpandMore />
                                                      )}
                                                    </ListItemButton>
                                                    <Collapse
                                                      in={expandedIndexes.has(
                                                        tableKey,
                                                      )}
                                                      timeout="auto"
                                                      unmountOnExit
                                                    >
                                                      <List
                                                        component="div"
                                                        disablePadding
                                                      >
                                                        {loadingIndexes.has(
                                                          table.id,
                                                        ) ? (
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
                                                            ),
                                                          )
                                                        )}
                                                      </List>
                                                    </Collapse>
                                                  </List>
                                                </Collapse>
                                              </React.Fragment>
                                            );
                                          },
                                        )
                                      )}

                                      <ListItem sx={{ pl: 8 }}>
                                        <ListItemText primary="Views" />
                                      </ListItem>
                                      {loadingViews.has(schema.id) ? (
                                        <ListItem sx={{ pl: 10 }}>
                                          <CircularProgress
                                            size={16}
                                            sx={{ mr: 1 }}
                                          />
                                          <ListItemText primary="Loading views..." />
                                        </ListItem>
                                      ) : (
                                        (views[schema.id] || []).map((view) => (
                                          <ListItem
                                            key={view.id}
                                            sx={{ pl: 10 }}
                                          >
                                            <ListItemText primary={view.name} />
                                          </ListItem>
                                        ))
                                      )}
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
    </Box>
  );
}

export default LeftPanel;
                                <React.Fragment key={schema.id}>
                                  <ListItemButton
                                    sx={{ pl: 6 }}
                                    onClick={() =>
                                      handleSchemaClick(schema, server)
                                    }
                                  >
                                    <ListItemText primary={schema.name} />
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
                                              table,
                                            );
                                            return (
                                              <React.Fragment key={table.id}>
                                                <ListItemButton
                                                  sx={{ pl: 8 }}
                                                  onClick={() =>
                                                    handleTableClick(
                                                      table,
                                                      schema,
                                                      server,
                                                    )
                                                  }
                                                >
                                                  <TableChart sx={{ mr: 1 }} />
                                                  <ListItemText
                                                    primary={table.name}
                                                    secondary={table.type_}
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
                                                          server,
                                                        )
                                                      }
                                                    >
                                                      <ViewColumn sx={{ mr: 1 }} />
                                                      <ListItemText primary="Columns" />
                                                      {expandedColumns.has(
                                                        tableKey,
                                                      ) ? (
                                                        <ExpandLess />
                                                      ) : (
                                                        <ExpandMore />
                                                      )}
                                                    </ListItemButton>
                                                    <Collapse
                                                      in={expandedColumns.has(
                                                        tableKey,
                                                      )}
                                                      timeout="auto"
                                                      unmountOnExit
                                                    >
                                                      <List
                                                        component="div"
                                                        disablePadding
                                                      >
                                                        {loadingColumns.has(
                                                          table.id,
                                                        ) ? (
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
                                                            ),
                                                          )
                                                        )}
                                                      </List>
                                                    </Collapse>

                                                    <ListItemButton
                                                      sx={{ pl: 10 }}
                                                      onClick={() =>
                                                        handleIndexesClick(
                                                          table,
                                                          schema,
                                                          server,
                                                        )
                                                      }
                                                    >
                                                      <ListAlt sx={{ mr: 1 }} />
                                                      <ListItemText primary="Indexes" />
                                                      {expandedIndexes.has(
                                                        tableKey,
                                                      ) ? (
                                                        <ExpandLess />
                                                      ) : (
                                                        <ExpandMore />
                                                      )}
                                                    </ListItemButton>
                                                    <Collapse
                                                      in={expandedIndexes.has(
                                                        tableKey,
                                                      )}
                                                      timeout="auto"
                                                      unmountOnExit
                                                    >
                                                      <List
                                                        component="div"
                                                        disablePadding
                                                      >
                                                        {loadingIndexes.has(
                                                          table.id,
                                                        ) ? (
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
                                                            ),
                                                          )
                                                        )}
                                                      </List>
                                                    </Collapse>
                                                  </List>
                                                </Collapse>
                                              </React.Fragment>
                                            );
                                          },
                                        )
                                      )}

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
                      >
                        <Storage sx={{ mr: 1 }} />
                        <ListItemText primary={displayDatabaseName} />
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
                                  databaseName,
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
                                  >
                                    <ListItemText primary={schema.name} />
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
                                              table,
                                            );
                                            return (
                                              <React.Fragment key={table.id}>
                                                <ListItemButton
                                                  sx={{ pl: 8 }}
                                                  onClick={() =>
                                                    handleTableClick(
                                                      table,
                                                      schema,
                                                      server,
                                                    )
                                                  }
                                                >
                                                  <TableChart sx={{ mr: 1 }} />
                                                  <ListItemText
                                                    primary={table.name}
                                                    secondary={table.type_}
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
                                                          server,
                                                        )
                                                      }
                                                    >
                                                      <ViewColumn sx={{ mr: 1 }} />
                                                      <ListItemText primary="Columns" />
                                                      {expandedColumns.has(
                                                        tableKey,
                                                      ) ? (
                                                        <ExpandLess />
                                                      ) : (
                                                        <ExpandMore />
                                                      )}
                                                    </ListItemButton>
                                                    <Collapse
                                                      in={expandedColumns.has(
                                                        tableKey,
                                                      )}
                                                      timeout="auto"
                                                      unmountOnExit
                                                    >
                                                      <List
                                                        component="div"
                                                        disablePadding
                                                      >
                                                        {loadingColumns.has(
                                                          table.id,
                                                        ) ? (
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
                                                            ),
                                                          )
                                                        )}
                                                      </List>
                                                    </Collapse>

                                                    <ListItemButton
                                                      sx={{ pl: 10 }}
                                                      onClick={() =>
                                                        handleIndexesClick(
                                                          table,
                                                          schema,
                                                          server,
                                                        )
                                                      }
                                                    >
                                                      <ListAlt sx={{ mr: 1 }} />
                                                      <ListItemText primary="Indexes" />
                                                      {expandedIndexes.has(
                                                        tableKey,
                                                      ) ? (
                                                        <ExpandLess />
                                                      ) : (
                                                        <ExpandMore />
                                                      )}
                                                    </ListItemButton>
                                                    <Collapse
                                                      in={expandedIndexes.has(
                                                        tableKey,
                                                      )}
                                                      timeout="auto"
                                                      unmountOnExit
                                                    >
                                                      <List
                                                        component="div"
                                                        disablePadding
                                                      >
                                                        {loadingIndexes.has(
                                                          table.id,
                                                        ) ? (
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
                                                            ),
                                                          )
                                                        )}
                                                      </List>
                                                    </Collapse>
                                                  </List>
                                                </Collapse>
                                              </React.Fragment>
                                            );
                                          },
                                        )
                                      )}

                                      <ListItem sx={{ pl: 8 }}>
                                        <ListItemText primary="Views" />
                                      </ListItem>
                                      {loadingViews.has(schema.id) ? (
                                        <ListItem sx={{ pl: 10 }}>
                                          <CircularProgress
                                            size={16}
                                            sx={{ mr: 1 }}
                                          />
                                          <ListItemText primary="Loading views..." />
                                        </ListItem>
                                      ) : (
                                        (views[schema.id] || []).map((view) => (
                                          <ListItem
                                            key={view.id}
                                            sx={{ pl: 10 }}
                                          >
                                            <ListItemText primary={view.name} />
                                          </ListItem>
                                        ))
                                      )}
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
    </Box>
  );
}

export default LeftPanel;
