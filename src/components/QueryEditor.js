import React, { useState, useCallback, useEffect, memo, useRef } from 'react';
import {
  Box,
  TextField,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  Typography,
  Paper,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Clear,
  History,
  Save,
} from '@mui/icons-material';

const QueryEditor = memo(({
  serverId,
  serverName,
  initialSql = '',
  onExecute,
  onCancel,
  onClear,
  onShowHistory,
  isExecuting = false,
  isCancelling = false
}) => {
  const [sql, setSql] = useState(initialSql);
  const [rows, setRows] = useState(0);
  const textFieldRef = useRef(null);

  // Update SQL when initialSql changes (e.g., from history selection)
  useEffect(() => {
    if (initialSql) {
      setSql(initialSql);
      setRows(initialSql.split('\n').length);
      // Move cursor to end of text
      setTimeout(() => {
        if (textFieldRef.current) {
          const input = textFieldRef.current.querySelector('textarea');
          if (input) {
            input.focus();
            input.setSelectionRange(initialSql.length, initialSql.length);
          }
        }
      }, 0);
    }
  }, [initialSql]);

  const handleExecute = useCallback(async () => {
    if (!sql.trim() || !serverId) return;

    try {
      await onExecute(sql);
    } catch (error) {
      console.error('Query execution error:', error);
    }
  }, [sql, serverId, onExecute]);

  const handleClear = useCallback(() => {
    setSql('');
    setRows(0);
    if (onClear) onClear();
  }, [onClear]);

  const handleKeyDown = useCallback((e) => {
    // Ctrl+Enter or Cmd+Enter to execute
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
    // Tab key inserts 2 spaces instead of leaving field
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newValue = sql.substring(0, start) + '  ' + sql.substring(end);
      setSql(newValue);
      // Set cursor position after the inserted spaces
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
    }
  }, [sql, handleExecute]);

  const handleChange = useCallback((e) => {
    const value = e.target.value;
    setSql(value);
    // Count approximate rows (lines)
    setRows(value.split('\n').length);
  }, []);

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
      }}
    >
      {/* Editor Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          backgroundColor: 'grey.50',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {serverName || 'No server selected'}
          </Typography>
          {rows > 0 && (
            <Typography variant="caption" color="text.secondary">
              ({rows} {rows === 1 ? 'line' : 'lines'})
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Execute (Ctrl+Enter)">
            <span>
              <IconButton
                size="small"
                color="primary"
                onClick={handleExecute}
                disabled={!sql.trim() || !serverId || isExecuting}
              >
                {isExecuting ? (
                  <CircularProgress size={20} />
                ) : (
                  <PlayArrow />
                )}
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Stop execution">
            <span>
              <IconButton
                size="small"
                color="error"
                onClick={onCancel}
                disabled={!isExecuting || isCancelling}
              >
                <Stop />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Clear editor">
            <span>
              <IconButton
                size="small"
                onClick={handleClear}
                disabled={!sql.trim()}
              >
                <Clear />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Show history">
            <IconButton
              size="small"
              onClick={onShowHistory}
              disabled={!serverId}
            >
              <History />
            </IconButton>
          </Tooltip>

        </Box>
      </Box>

      {/* SQL Editor */}
      <Box ref={textFieldRef} sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TextField
          multiline
          fullWidth
          variant="outlined"
          placeholder={
            serverId
              ? "Enter SQL query here...\n\nExamples:\nSELECT * FROM table_name LIMIT 100;\nSHOW TABLES;"
              : "Select a server to start querying"
          }
          value={sql}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={!serverId || isExecuting}
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              height: '100%',
              alignItems: 'flex-start',
              fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
              fontSize: '13px',
              lineHeight: 1.6,
              '& fieldset': {
                border: 'none',
              },
            },
            '& .MuiInputBase-input': {
              height: '100% !important',
              overflow: 'auto !important',
              padding: 2,
            },
          }}
          InputProps={{
            sx: {
              height: '100%',
            },
          }}
        />
      </Box>

      {/* Editor Footer */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 0.5,
          borderTop: 1,
          borderColor: 'divider',
          backgroundColor: 'grey.50',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Tip: Press Ctrl+Enter to execute query
        </Typography>
        {serverId && (
          <Button
            size="small"
            variant="contained"
            startIcon={isExecuting ? <CircularProgress size={16} /> : <PlayArrow />}
            onClick={handleExecute}
            disabled={!sql.trim() || isExecuting}
          >
            Execute Query
          </Button>
        )}
      </Box>
    </Paper>
  );
});

QueryEditor.displayName = 'QueryEditor';

export default QueryEditor;
