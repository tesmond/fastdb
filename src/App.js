import React, { useState, useEffect } from "react";
import {
  Box,
  CssBaseline,
  ThemeProvider,
  createTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import LeftPanelFixed from "./components/LeftPanelFixed";
import RightPanel from "./components/RightPanel";

const theme = createTheme();

function App() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [schemas, setSchemas] = useState([]);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [serverForm, setServerForm] = useState({
    name: "",
    host: "",
    port: 5432,
    database: "",
    username: "",
    password: "",
  });

  useEffect(() => {
    loadServers();

    // Listen for schema updates
    const unlistenSchema = listen("schema_updated", (event) => {
      setSchemas(event.payload.schemas);
    });

    return () => {
      unlistenSchema.then((fn) => fn());
    };
  }, []);

  const loadServers = async () => {
    try {
      const serverList = await invoke("get_cached_servers");
      setServers(serverList);
    } catch (error) {
      console.error("Failed to load servers:", error);
    }
  };

  const handleServerSelect = async (server) => {
    setSelectedServer(server);
    try {
      const schemaList = await invoke("get_schema_tree", {
        serverId: server.id,
      });
      setSchemas(schemaList);
      // Always refresh schema in the background for up-to-date data
      invoke("refresh_schema", { serverId: server.id });
    } catch (error) {
      console.error("Failed to load schema:", error);
    }
  };

  const handleRefreshServer = async (server) => {
    try {
      await invoke("refresh_schema", { serverId: server.id });
      await loadServers();
    } catch (error) {
      console.error("Failed to refresh server schema:", error);
    }
  };

  const handleAddServer = async () => {
    try {
      const id = "server-" + Date.now();
      const credentialKey = "cred-" + id;
      const server = {
        id,
        name: serverForm.name,
        host: serverForm.host,
        port: serverForm.port,
        database: serverForm.database,
        username: serverForm.username,
        credential_key: credentialKey,
        group_name: null,
        last_connected: null,
      };
      await invoke("add_server", { server, password: serverForm.password });
      setAddServerOpen(false);
      setServerForm({
        name: "",
        host: "",
        port: 5432,
        database: "",
        username: "",
        password: "",
      });
      loadServers();
    } catch (error) {
      console.error("Failed to add server:", error);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", height: "100vh" }}>
        <LeftPanelFixed
          servers={servers}
          schemas={schemas}
          onServerSelect={handleServerSelect}
          selectedServer={selectedServer}
          onRefreshServer={handleRefreshServer}
          onAddServer={() => setAddServerOpen(true)}
        />
        <RightPanel
          selectedServer={selectedServer}
          onSchemaRefresh={handleRefreshServer}
        />
      </Box>
      <Dialog open={addServerOpen} onClose={() => setAddServerOpen(false)}>
        <DialogTitle>Add Server</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Server Name"
            fullWidth
            variant="standard"
            value={serverForm.name}
            onChange={(e) =>
              setServerForm({ ...serverForm, name: e.target.value })
            }
          />
          <TextField
            margin="dense"
            label="Host"
            fullWidth
            variant="standard"
            value={serverForm.host}
            onChange={(e) =>
              setServerForm({ ...serverForm, host: e.target.value })
            }
          />
          <TextField
            margin="dense"
            label="Port"
            type="number"
            fullWidth
            variant="standard"
            value={serverForm.port}
            onChange={(e) =>
              setServerForm({ ...serverForm, port: parseInt(e.target.value) })
            }
          />
          <TextField
            margin="dense"
            label="Database"
            fullWidth
            variant="standard"
            value={serverForm.database}
            onChange={(e) =>
              setServerForm({ ...serverForm, database: e.target.value })
            }
          />
          <TextField
            margin="dense"
            label="Username"
            fullWidth
            variant="standard"
            value={serverForm.username}
            onChange={(e) =>
              setServerForm({ ...serverForm, username: e.target.value })
            }
          />
          <TextField
            margin="dense"
            label="Password"
            type="password"
            fullWidth
            variant="standard"
            value={serverForm.password}
            onChange={(e) =>
              setServerForm({ ...serverForm, password: e.target.value })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddServerOpen(false)}>Cancel</Button>
          <Button onClick={handleAddServer}>Add</Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}

export default App;
