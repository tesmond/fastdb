import React, { useState, useCallback, useEffect, memo, useRef, useMemo } from 'react';
import {
  Box,
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
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';

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
  const editorViewRef = useRef(null);

  // Update SQL when initialSql changes (e.g., from history selection)
  useEffect(() => {
    if (initialSql) {
      setSql(initialSql);
      setRows(initialSql.split('\n').length);
      // Move cursor to end of text
      setTimeout(() => {
        const view = editorViewRef.current;
        if (!view) return;
        view.focus();
        view.dispatch({
          selection: { anchor: view.state.doc.length },
          scrollIntoView: true,
        });
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

  const handleChange = useCallback((value) => {
    setSql(value);
    // Count approximate rows (lines)
    setRows(value.split('\n').length);
  }, []);

  const executeKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            handleExecute();
            return true;
          },
        },
        indentWithTab,
      ]),
    [handleExecute],
  );

  const editorPlaceholder = serverId
    ? "Enter SQL query here...\n\nExamples:\nSELECT * FROM table_name LIMIT 100;\nSHOW TABLES;"
    : 'Select a server to start querying';

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
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <CodeMirror
          value={sql}
          height="100%"
          extensions={[
            sqlLang(),
            EditorView.lineWrapping,
            executeKeymap,
            placeholder(editorPlaceholder),
            EditorView.editable.of(Boolean(serverId) && !isExecuting),
            EditorView.theme({
              '&': {
                height: '100%',
                fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
                fontSize: '13px',
                lineHeight: 1.6,
              },
              '.cm-scroller': { overflow: 'auto' },
              '.cm-content': { padding: '16px' },
            }),
          ]}
          onChange={handleChange}
          onCreateEditor={(view) => {
            editorViewRef.current = view;
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
