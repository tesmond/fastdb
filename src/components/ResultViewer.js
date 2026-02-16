import React, { useState, useCallback, useMemo, memo, useEffect, useRef } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Tooltip,
  Alert,
  Chip,
  Menu,
  MenuItem,
  TextField,
  InputAdornment,
} from "@mui/material";
import {
  GetApp,
  FilterList,
  Search,
  Close,
  ContentCopy,
  CheckCircle,
  Error as ErrorIcon,
  Edit,
  Save,
  Undo,
  VpnKey,
} from "@mui/icons-material";
import { FixedSizeList } from "react-window";

// Standalone cell editor — manages its own local state so keystrokes
// don't recreate the virtualised Row and reset the cursor.
// Handles its own commit-on-click-outside via onBlur.
const CellEditor = memo(({ initialValue, placeholder, onCommit, onCancel }) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const containerRef = useRef(null);
  // Guard against double-commit (blur can fire after Enter/Escape)
  const committedRef = useRef(false);

  useEffect(() => {
    committedRef.current = false;
  }, []);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, []);

  const doCommit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(valueRef.current);
  }, [onCommit]);

  const doCancel = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        doCommit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        doCancel();
      }
    },
    [doCommit, doCancel],
  );

  const handleBlur = useCallback(
    (event) => {
      // If focus moves to another element inside this container, don't commit
      if (
        containerRef.current &&
        event.relatedTarget &&
        containerRef.current.contains(event.relatedTarget)
      ) {
        return;
      }
      doCommit();
    },
    [doCommit],
  );

  return (
    <Box ref={containerRef} sx={{ flex: 1, mr: 1 }}>
      <TextField
        size="small"
        multiline
        maxRows={6}
        inputRef={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        variant="standard"
        InputProps={{
          disableUnderline: true,
          sx: { fontSize: "0.875rem" },
        }}
        sx={{ width: "100%" }}
      />
    </Box>
  );
});
CellEditor.displayName = "CellEditor";

const ResultViewer = memo(
  ({
    results = null,
    error = null,
    isLoading = false,
    executionTime = null,
    rowsAffected = null,
    editableInfo = null,
    onSaveEdits,
  }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [filterAnchor, setFilterAnchor] = useState(null);
    // track copied and hovered cells by key to avoid matching by value (null/undefined)
    const [copiedKey, setCopiedKey] = useState(null);
    const [editingCell, setEditingCell] = useState(null);
    const [pendingEdits, setPendingEdits] = useState({});
    const [isSavingEdits, setIsSavingEdits] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [baseRows, setBaseRows] = useState([]);

    // Parse results
    const { columns, rows: rawRows } = useMemo(() => {
      if (!results || !results.columns || !results.rows) {
        return { columns: [], rows: [] };
      }
      return {
        columns: results.columns,
        rows: results.rows,
      };
    }, [results]);

    // Keep baseRows in sync with rawRows from new query results
    useEffect(() => {
      setBaseRows(rawRows);
    }, [rawRows]);

    const message = useMemo(() => {
      if (!results || !results.message) return null;
      return results.message;
    }, [results]);

    const shouldShowRowsAffected = useMemo(() => {
      if (rowsAffected === null || rowsAffected === undefined) return false;
      return baseRows.length === 0;
    }, [rowsAffected, baseRows.length]);

    const primaryKeyColumns = useMemo(() => {
      return editableInfo?.primaryKeyColumns || [];
    }, [editableInfo]);

    const hasPrimaryKey = useMemo(() => {
      if (!primaryKeyColumns.length) return false;
      const columnNames = new Set(columns.map((col) => col.name));
      return primaryKeyColumns.every((name) => columnNames.has(name));
    }, [columns, primaryKeyColumns]);

    const canEdit = Boolean(
      editableInfo?.tableName &&
        editableInfo?.schemaName &&
        hasPrimaryKey &&
        typeof onSaveEdits === "function",
    );

    const getRowKey = useCallback(
      (row) => {
        if (!canEdit) return null;
        const values = primaryKeyColumns.map((name) => row?.[name]);
        return JSON.stringify(values);
      },
      [canEdit, primaryKeyColumns],
    );

    const rowKeyMap = useMemo(() => {
      if (!canEdit) return {};
      const map = {};
      baseRows.forEach((row) => {
        const key = getRowKey(row);
        if (key !== null) {
          map[key] = row;
        }
      });
      return map;
    }, [baseRows, canEdit, getRowKey]);

    // Filter rows based on search term
    const filteredRows = useMemo(() => {
      if (!searchTerm.trim()) return baseRows;

      const term = searchTerm.toLowerCase();
      return baseRows.filter((row) =>
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(term),
        ),
      );
    }, [baseRows, searchTerm]);

    const handleCopyCell = useCallback((key, value) => {
      try {
        navigator.clipboard.writeText(String(value));
      } catch (e) {
        // ignore clipboard errors (e.g., insecure context)
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }, []);

    const normalizeValue = useCallback((value) => {
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }, []);

    const getPendingValue = useCallback(
      (rowKey, columnName) => {
        const rowEdits = pendingEdits[rowKey];
        if (!rowEdits) return undefined;
        return rowEdits[columnName];
      },
      [pendingEdits],
    );

    const isCellEdited = useCallback(
      (row, rowKey, columnName) => {
        if (!rowKey) return false;
        const pendingValue = getPendingValue(rowKey, columnName);
        if (pendingValue === undefined) return false;
        const baseValue = normalizeValue(row?.[columnName]);
        return pendingValue !== baseValue;
      },
      [getPendingValue, normalizeValue],
    );

    const handleEditStart = useCallback(
      (rowKey, columnName, row) => {
        if (!canEdit || !rowKey) return;
        const pending = pendingEdits[rowKey]?.[columnName];
        const initial = pending !== undefined ? pending : normalizeValue(row?.[columnName]);
        setEditingCell({ rowKey, columnName, initialValue: initial });
      },
      [canEdit, normalizeValue, pendingEdits],
    );

    const applyEditValue = useCallback(
      (rowKey, columnName, value, row) => {
        if (!rowKey) return;
        const normalized = normalizeValue(row?.[columnName]);
        setPendingEdits((prev) => {
          const next = { ...prev };
          const nextRow = { ...(next[rowKey] || {}) };
          if (value === normalized) {
            delete nextRow[columnName];
          } else {
            nextRow[columnName] = value;
          }

          if (Object.keys(nextRow).length === 0) {
            delete next[rowKey];
          } else {
            next[rowKey] = nextRow;
          }

          return next;
        });
      },
      [normalizeValue],
    );

    const commitEdit = useCallback(
      (rowKey, columnName, value, row) => {
        applyEditValue(rowKey, columnName, value, row);
        setEditingCell(null);
      },
      [applyEditValue],
    );

    const cancelEdit = useCallback(
      (rowKey, columnName, row) => {
        applyEditValue(rowKey, columnName, normalizeValue(row?.[columnName]), row);
        setEditingCell(null);
      },
      [applyEditValue, normalizeValue],
    );

    const hasEdits = useMemo(() => Object.keys(pendingEdits).length > 0, [pendingEdits]);

    const handleRevertEdits = useCallback(() => {
      setPendingEdits({});
      setEditingCell(null);
      setSaveError(null);
    }, []);

    const handleSaveEdits = useCallback(async () => {
      if (!hasEdits || !canEdit) return;
      const updates = Object.entries(pendingEdits)
        .map(([rowKey, changes]) => ({
          rowKey,
          row: rowKeyMap[rowKey],
          changes,
        }))
        .filter((entry) => entry.row && Object.keys(entry.changes || {}).length > 0);

      if (!updates.length) {
        handleRevertEdits();
        return;
      }

      setIsSavingEdits(true);
      setSaveError(null);

      try {
        await onSaveEdits({
          tableName: editableInfo?.tableName,
          schemaName: editableInfo?.schemaName,
          databaseName: editableInfo?.databaseName || null,
          primaryKeyColumns,
          updates,
        });

        setBaseRows((prevRows) =>
          prevRows.map((row) => {
            const rowKey = getRowKey(row);
            const changes = rowKey ? pendingEdits[rowKey] : null;
            if (!changes) return row;
            return { ...row, ...changes };
          }),
        );

        setPendingEdits({});
        setEditingCell(null);
      } catch (saveErr) {
        setSaveError(saveErr?.message || saveErr?.toString?.() || "Failed to save changes.");
      } finally {
        setIsSavingEdits(false);
      }
    }, [
      canEdit,
      editableInfo,
      getRowKey,
      handleRevertEdits,
      hasEdits,
      onSaveEdits,
      pendingEdits,
      primaryKeyColumns,
      rowKeyMap,
    ]);

    const handleExport = useCallback(() => {
      if (!columns.length || !baseRows.length) return;

      // Generate CSV
      const csvContent = [
        columns.map((col) => `"${col.name}"`).join(","),
        ...baseRows.map((row) =>
          columns
            .map((col) => {
              const value = row[col.name];
              const escaped = String(value).replace(/"/g, '""');
              return `"${escaped}"`;
            })
            .join(","),
        ),
      ].join("\n");

      // Prepend UTF-8 BOM so Excel on Windows recognizes UTF-8 encoding
      const bom = "\uFEFF";

      // Download
      const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `query_results_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }, [columns, baseRows]);

    const handleFilterClick = useCallback((event) => {
      setFilterAnchor(event.currentTarget);
    }, []);

    const handleFilterClose = useCallback(() => {
      setFilterAnchor(null);
    }, []);

    const formatCellValue = useCallback((value) => {
      if (value === null) return <em style={{ color: "#999" }}>NULL</em>;
      if (value === undefined)
        return <em style={{ color: "#999" }}>undefined</em>;
      if (typeof value === "boolean") return value ? "true" : "false";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }, []);

    const tableMinWidth = useMemo(() => {
      const colMin = 150;
      return 60 + columns.length * colMin;
    }, [columns.length]);

    // track measured container width so virtual list can expand
    const listContainerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(null);

    useEffect(() => {
      function updateWidth() {
        if (listContainerRef.current && listContainerRef.current.clientWidth)
          setContainerWidth(listContainerRef.current.clientWidth);
        else setContainerWidth(window.innerWidth);
      }
      updateWidth();
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }, [columns.length, tableMinWidth]);

    // Row renderer for virtualization
    const Row = useCallback(
      ({ index, style }) => {
        const row = filteredRows[index];
        const rowKey = canEdit ? getRowKey(row) : null;
        return (
          <Box
            style={style}
            sx={{
              display: "flex",
              borderBottom: 1,
              borderColor: "divider",
              "&:hover": {
                backgroundColor: "action.hover",
              },
              "&:hover .row-actions": {
                opacity: 1,
                pointerEvents: "auto",
              },
            }}
          >
            {/* Row number */}
            <Box
              sx={{
                width: 60,
                minWidth: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRight: 1,
                borderColor: "divider",
                backgroundColor: "grey.50",
                fontWeight: 500,
                fontSize: "0.875rem",
                color: "text.secondary",
              }}
            >
              {index + 1}
            </Box>

            {/* Data cells */}
            {columns.map((col, colIndex) => {
              const cellKey = `${index}-${colIndex}`;
              const pendingValue = rowKey ? getPendingValue(rowKey, col.name) : undefined;
              const baseValue = row?.[col.name];
              const displayValue =
                pendingValue !== undefined ? pendingValue : baseValue;
              const isEdited = rowKey
                ? isCellEdited(row, rowKey, col.name)
                : false;
              const isEditing =
                editingCell?.rowKey === rowKey &&
                editingCell?.columnName === col.name;
              const canEditCell = canEdit && rowKey;
              return (
              <Box
                key={cellKey}
                sx={{
                  minWidth: 150,
                  maxWidth: 300,
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  px: 2,
                  py: 1,
                  borderRight: colIndex < columns.length - 1 ? 1 : 0,
                  borderColor: "divider",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: isEditing ? "pre-wrap" : "nowrap",
                  position: "relative",
                }}
                title={`Value: ${displayValue}`}
              >
                {isEditing ? (
                  <CellEditor
                    initialValue={editingCell.initialValue}
                    placeholder={baseValue === null ? "NULL" : ""}
                    onCommit={(val) => commitEdit(rowKey, col.name, val, row)}
                    onCancel={() => cancelEdit(rowKey, col.name, row)}
                  />
                ) : (
                  <Typography
                    variant="body2"
                    sx={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      cursor: "default",
                      fontWeight: isEdited ? 700 : 400,
                    }}
                  >
                    {formatCellValue(displayValue)}
                  </Typography>
                )}

                <Box
                  className="row-actions"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    ml: 1,
                    opacity: 0,
                    transition: "opacity 0.12s",
                    pointerEvents: "none",
                  }}
                >
                  {canEditCell && (
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => handleEditStart(rowKey, col.name, row)}
                      >
                        <Edit fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Copy">
                    <IconButton
                      size="small"
                      onClick={() => handleCopyCell(cellKey, displayValue)}
                    >
                      {copiedKey === cellKey ? (
                        <CheckCircle fontSize="inherit" sx={{ color: "success.main" }} />
                      ) : (
                        <ContentCopy fontSize="inherit" />
                      )}
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              );
            })}
          </Box>
        );
      },
      [
        filteredRows,
        columns,
        copiedKey,
        editingCell,
        canEdit,
        applyEditValue,
        cancelEdit,
        getPendingValue,
        getRowKey,
        handleCopyCell,
        handleEditStart,
        isCellEdited,
        normalizeValue,
        formatCellValue,
      ],
    );

    // Loading state
    if (isLoading) {
      return (
        <Box
          sx={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Typography variant="body1" color="text.secondary">
            Executing query...
          </Typography>
        </Box>
      );
    }

    // Error state
    if (error) {
      const errorParts = error.split("\n\n");
      const queryInfo = errorParts[0];
      const errorMessage = errorParts[1] || "";

      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error" icon={<ErrorIcon />}>
            <Typography variant="subtitle2" gutterBottom>
              Query Error
            </Typography>
            {queryInfo && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  Executed Query:
                </Typography>
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                    backgroundColor: "grey.100",
                    p: 1,
                    borderRadius: 1,
                    overflow: "auto",
                    maxHeight: 200,
                  }}
                >
                  {queryInfo.replace("Error executing query:\n", "")}
                </Typography>
              </Box>
            )}
            {errorMessage && (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  Error Details:
                </Typography>
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                    backgroundColor: "error.light",
                    color: "error.contrastText",
                    p: 1,
                    borderRadius: 1,
                    overflow: "auto",
                    maxHeight: 200,
                  }}
                >
                  {errorMessage}
                </Typography>
              </Box>
            )}
          </Alert>
        </Box>
      );
    }

    if (message && baseRows.length === 0) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="success" icon={<CheckCircle />}>
            <Typography variant="subtitle2">{message}</Typography>
            {executionTime !== null && (
              <Typography variant="body2">
                Completed in {executionTime} ms
              </Typography>
            )}
          </Alert>
        </Box>
      );
    }

    if (shouldShowRowsAffected) {
      return (
        <Box
          sx={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2,
            p: 3,
          }}
        >
          <Chip
            color="success"
            label={`${rowsAffected} row${rowsAffected === 1 ? "" : "s"} affected`}
          />
          {executionTime !== null && (
            <Typography variant="body2" color="text.secondary">
              Completed in {executionTime} ms
            </Typography>
          )}
        </Box>
      );
    }

    // Empty state
    if (!results) {
      return (
        <Box
          sx={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography variant="body1" color="text.secondary">
            Execute a query to see results
          </Typography>
        </Box>
      );
    }

    // Success state with no rows
    if (columns.length === 0 && rowsAffected !== null) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="success" icon={<CheckCircle />}>
            <Typography variant="subtitle2">
              Query executed successfully
            </Typography>
            <Typography variant="body2">
              {rowsAffected} row{rowsAffected !== 1 ? "s" : ""} affected
              {executionTime && ` in ${executionTime}ms`}
            </Typography>
          </Alert>
        </Box>
      );
    }

    // Results view
    return (
      <Paper
        elevation={0}
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          border: 1,
          borderColor: "divider",
        }}
      >
        {/* Results Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: 1,
            borderBottom: 1,
            borderColor: "divider",
            backgroundColor: "grey.50",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="body2" fontWeight={500}>
              Results
            </Typography>
            <Chip
              label={`${filteredRows.length} row${filteredRows.length !== 1 ? "s" : ""}`}
              size="small"
              color="primary"
              variant="outlined"
            />
            {executionTime && (
              <Chip
                label={`${executionTime}ms`}
                size="small"
                variant="outlined"
              />
            )}
            {searchTerm && filteredRows.length < baseRows.length && (
              <Chip
                label={`Filtered from ${baseRows.length}`}
                size="small"
                color="warning"
                variant="outlined"
              />
            )}
            {saveError && (
              <Typography variant="caption" color="error">
                {saveError}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            {canEdit && hasEdits && (
              <>
                <Tooltip title="Save changes">
                  <span>
                    <IconButton
                      size="small"
                      onClick={handleSaveEdits}
                      disabled={isSavingEdits}
                    >
                      <Save />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Revert changes">
                  <span>
                    <IconButton
                      size="small"
                      onClick={handleRevertEdits}
                      disabled={isSavingEdits}
                    >
                      <Undo />
                    </IconButton>
                  </span>
                </Tooltip>
              </>
            )}
            {/* Search */}
            <TextField
              size="small"
              placeholder="Search results..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchTerm && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm("")}>
                      <Close fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ width: 200 }}
            />

            {/* Filter */}
            <Tooltip title="Filter columns">
              <IconButton size="small" onClick={handleFilterClick}>
                <FilterList />
              </IconButton>
            </Tooltip>

            {/* Export */}
            <Tooltip title="Export to CSV">
              <IconButton size="small" onClick={handleExport}>
                <GetApp />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Table header + body in a shared horizontal scroller so columns align */}
        <Box sx={{ flex: 1, overflowX: "auto" }}>
          <Box sx={{ minWidth: tableMinWidth }}>
            {/* Table Header */}
            <Box
              sx={{
                display: "flex",
                borderBottom: 2,
                borderColor: "divider",
                backgroundColor: "grey.100",
              }}
            >
              {/* Row number header */}
              <Box
                sx={{
                  width: 60,
                  minWidth: 60,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRight: 1,
                  borderColor: "divider",
                  py: 1,
                  fontWeight: 600,
                  fontSize: "0.875rem",
                }}
              >
                #
              </Box>

              {/* Column headers */}
              {columns.map((col, index) => {
                const isPrimaryKey = primaryKeyColumns.includes(col.name);
                return (
                <Box
                  key={index}
                  sx={{
                    minWidth: 150,
                    maxWidth: 300,
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    px: 2,
                    py: 1,
                    borderRight: index < columns.length - 1 ? 1 : 0,
                    borderColor: "divider",
                  }}
                >
                  {isPrimaryKey && (
                    <Tooltip title={`Primary key: ${primaryKeyColumns.join(", ")}`}>
                      <VpnKey sx={{ fontSize: 16, mr: 0.5, color: "warning.main" }} />
                    </Tooltip>
                  )}
                  <Tooltip title={col.type || "unknown type"}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col.name}
                    </Typography>
                  </Tooltip>
                </Box>
                );
              })}
            </Box>

            {/* Virtualized Table Body */}
            {filteredRows.length > 0 ? (
              <Box sx={{ flex: 1, overflow: "hidden" }} ref={listContainerRef}>
                <FixedSizeList
                  height={500}
                  itemCount={filteredRows.length}
                  itemSize={40}
                  width={Math.max(tableMinWidth, containerWidth || tableMinWidth)}
                  overscanCount={5}
                >
                  {Row}
                </FixedSizeList>
              </Box>
            ) : (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {searchTerm ? "No results match your search" : "No rows returned"}
            </Typography>
          </Box>
        )}

        {/* Filter Menu */}
        <Menu
          anchorEl={filterAnchor}
          open={Boolean(filterAnchor)}
          onClose={handleFilterClose}
        >
          <MenuItem disabled>
            <Typography variant="caption">Column Filters</Typography>
          </MenuItem>
          {columns.map((col, index) => (
            <MenuItem key={index}>
              <Typography variant="body2">{col.name}</Typography>
            </MenuItem>
          ))}
        </Menu>
          </Box>
        </Box>
      </Paper>
    );
  },
);

ResultViewer.displayName = "ResultViewer";

export default ResultViewer;
