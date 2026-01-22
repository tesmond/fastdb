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
} from "@mui/icons-material";
import { FixedSizeList } from "react-window";

const ResultViewer = memo(
  ({
    results = null,
    error = null,
    isLoading = false,
    executionTime = null,
    rowsAffected = null,
  }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [filterAnchor, setFilterAnchor] = useState(null);
    // track copied and hovered cells by key to avoid matching by value (null/undefined)
    const [copiedKey, setCopiedKey] = useState(null);

    // Parse results
    const { columns, rows } = useMemo(() => {
      if (!results || !results.columns || !results.rows) {
        return { columns: [], rows: [] };
      }
      return {
        columns: results.columns,
        rows: results.rows,
      };
    }, [results]);

    const message = useMemo(() => {
      if (!results || !results.message) return null;
      return results.message;
    }, [results]);

    const shouldShowRowsAffected = useMemo(() => {
      if (rowsAffected === null || rowsAffected === undefined) return false;
      return rows.length === 0;
    }, [rowsAffected, rows.length]);

    // Filter rows based on search term
    const filteredRows = useMemo(() => {
      if (!searchTerm.trim()) return rows;

      const term = searchTerm.toLowerCase();
      return rows.filter((row) =>
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(term),
        ),
      );
    }, [rows, searchTerm]);

    const handleCopyCell = useCallback((key, value) => {
      try {
        navigator.clipboard.writeText(String(value));
      } catch (e) {
        // ignore clipboard errors (e.g., insecure context)
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }, []);

    const handleExport = useCallback(() => {
      if (!columns.length || !rows.length) return;

      // Generate CSV
      const csvContent = [
        columns.map((col) => `"${col.name}"`).join(","),
        ...rows.map((row) =>
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
    }, [columns, rows]);

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
                  whiteSpace: "nowrap",
                  position: "relative",
                  "&:hover .copyIcon": { opacity: 1 },
                }}
                onClick={() => handleCopyCell(cellKey, row[col.name])}
                title={`Click to copy: ${row[col.name]}`}
              >
                <Typography
                  variant="body2"
                  sx={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    cursor: "pointer",
                  }}
                >
                  {formatCellValue(row[col.name])}
                </Typography>
                <ContentCopy
                  className="copyIcon"
                  sx={{ ml: 1, fontSize: 16, color: "text.secondary", opacity: 0, transition: "opacity 0.12s", pointerEvents: "none" }}
                  style={copiedKey === cellKey ? { display: "none" } : {}}
                />
                {copiedKey === cellKey && (
                  <CheckCircle sx={{ ml: 1, fontSize: 16, color: "success.main" }} />
                )}
              </Box>
              );
            })}
          </Box>
        );
      },
      [filteredRows, columns, copiedKey, handleCopyCell, formatCellValue],
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

    if (message && rows.length === 0) {
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
            {searchTerm && filteredRows.length < rows.length && (
              <Chip
                label={`Filtered from ${rows.length}`}
                size="small"
                color="warning"
                variant="outlined"
              />
            )}
          </Box>

          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
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
              {columns.map((col, index) => (
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
              ))}
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
