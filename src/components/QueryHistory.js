import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  IconButton,
  Tooltip,
  Paper,
  InputAdornment,
  CircularProgress,
  Fade,
} from '@mui/material';
import {
  Search,
  Clear,
  Delete,
  History as HistoryIcon,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/tauri';

/**
 * Format a timestamp as a relative time string (e.g., "2 minutes ago", "Yesterday")
 */
function formatRelativeTime(timestamp) {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) {
    return 'Just now';
  } else if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diff < 172800) {
    return 'Yesterday';
  } else if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return `${days} days ago`;
  } else if (diff < 2592000) {
    const weeks = Math.floor(diff / 604800);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  } else {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  }
}

/**
 * Truncate SQL to a single line preview with ellipsis
 */
function truncateSql(sql, maxLength = 100) {
  // Replace newlines and multiple spaces with single space
  const singleLine = sql.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return singleLine.substring(0, maxLength) + '...';
}

/**
 * Highlight matching text in the SQL preview
 */
function highlightMatch(text, searchTerm) {
  if (!searchTerm.trim()) {
    return text;
  }

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={index} style={{ backgroundColor: '#fff59d', padding: 0 }}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * Query History Component
 * 
 * Displays a searchable list of previously executed SQL queries.
 * - Single click: Select/highlight the query
 * - Double click or Enter: Open in new tab
 * - Arrow keys: Navigate list
 * - Escape: Clear search or selection
 */
const QueryHistory = memo(({
  serverId,
  onSelectQuery,  // Called with the full SQL when user wants to use a query
  onClose,        // Called to close the history panel
}) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const listRef = useRef(null);
  const searchRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load or search history when server or search term changes
  useEffect(() => {
    if (!serverId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    const loadHistory = async () => {
      setLoading(true);
      try {
        let result;
        if (debouncedSearch.trim()) {
          result = await invoke('search_query_history', {
            serverId,
            searchTerm: debouncedSearch,
            limit: 500,
          });
        } else {
          result = await invoke('get_query_history_dedup', {
            serverId,
            limit: 500,
          });
        }
        setHistory(result);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Failed to load query history:', error);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [serverId, debouncedSearch]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, history.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < history.length) {
          const query = history[selectedIndex];
          onSelectQuery?.(query.sql);
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (searchTerm) {
          setSearchTerm('');
        } else if (selectedIndex >= 0) {
          setSelectedIndex(-1);
        } else {
          onClose?.();
        }
        break;
      default:
        break;
    }
  }, [history, selectedIndex, searchTerm, onSelectQuery, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const listElement = listRef.current;
      const selectedElement = listElement.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Handle single click - just select
  const handleItemClick = useCallback((index) => {
    setSelectedIndex(index);
  }, []);

  // Handle double click - use the query
  const handleItemDoubleClick = useCallback((query) => {
    onSelectQuery?.(query.sql);
  }, [onSelectQuery]);

  // Handle delete query
  const handleDeleteQuery = useCallback(async (e, entryId) => {
    e.stopPropagation();
    try {
      await invoke('delete_query_history_entry', { entryId });
      setHistory((prev) => prev.filter((q) => q.id !== entryId));
    } catch (error) {
      console.error('Failed to delete query:', error);
    }
  }, []);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    searchRef.current?.focus();
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
        overflow: 'hidden',
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          backgroundColor: 'grey.50',
        }}
      >
        <HistoryIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Query History
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <Clear fontSize="small" />
        </IconButton>
      </Box>

      {/* Search Input */}
      <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          ref={searchRef}
          size="small"
          fullWidth
          placeholder="Search queries..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: searchTerm && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClearSearch}>
                  <Clear fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '0.875rem',
            },
          }}
        />
      </Box>

      {/* Query List */}
      <Box
        ref={listRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {loading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              minHeight: 100,
            }}
          >
            <CircularProgress size={24} />
          </Box>
        ) : history.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              minHeight: 100,
              color: 'text.secondary',
              p: 2,
            }}
          >
            <HistoryIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
            <Typography variant="body2">
              {debouncedSearch
                ? 'No queries match your search'
                : 'No queries run yet'}
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {history.map((query, index) => (
              <Fade in key={query.id} timeout={150}>
                <ListItem
                  data-index={index}
                  disablePadding
                  secondaryAction={
                    <Tooltip title="Remove from history">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => handleDeleteQuery(e, query.id)}
                        sx={{
                          opacity: 0,
                          transition: 'opacity 0.2s',
                          '.MuiListItem-root:hover &': {
                            opacity: 1,
                          },
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemButton
                    selected={selectedIndex === index}
                    onClick={() => handleItemClick(index)}
                    onDoubleClick={() => handleItemDoubleClick(query)}
                    sx={{
                      py: 1,
                      pr: 5,
                      '&.Mui-selected': {
                        backgroundColor: 'primary.lighter',
                        '&:hover': {
                          backgroundColor: 'primary.light',
                        },
                      },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Tooltip
                          title={
                            <Box
                              component="pre"
                              sx={{
                                m: 0,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                maxHeight: 300,
                                overflow: 'auto',
                              }}
                            >
                              {query.sql}
                            </Box>
                          }
                          placement="right"
                          enterDelay={500}
                          arrow
                        >
                          <Typography
                            variant="body2"
                            component="span"
                            sx={{
                              fontFamily: '"Fira Code", "Consolas", monospace',
                              fontSize: '0.8rem',
                              display: 'block',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {highlightMatch(truncateSql(query.sql), debouncedSearch)}
                          </Typography>
                        </Tooltip>
                      }
                      secondary={
                        <Box
                          component="span"
                          sx={{
                            display: 'flex',
                            gap: 1,
                            alignItems: 'center',
                            mt: 0.5,
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {formatRelativeTime(query.last_executed_at)}
                          </Typography>
                          {query.execution_count > 1 && (
                            <Typography
                              variant="caption"
                              sx={{
                                backgroundColor: 'grey.200',
                                px: 0.75,
                                py: 0.25,
                                borderRadius: 1,
                                fontSize: '0.7rem',
                              }}
                            >
                              ×{query.execution_count}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              </Fade>
            ))}
          </List>
        )}
      </Box>

      {/* Footer with hint */}
      <Box
        sx={{
          p: 1,
          borderTop: 1,
          borderColor: 'divider',
          backgroundColor: 'grey.50',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Double-click or press Enter to use a query
        </Typography>
      </Box>
    </Paper>
  );
});

QueryHistory.displayName = 'QueryHistory';

export default QueryHistory;
