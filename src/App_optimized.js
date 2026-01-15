import React, { useState, useEffect, useCallback } from "react";
import { Box, CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import LeftPanel from "./components/LeftPanel";
import RightPanel from "./components/RightPanel";

const theme = createTheme({
  palette: {
    mode: "light",
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          overflow: "hidden",
        },
      },
    },
  },
});

function App() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [schemasByServer, setSchemasByServer] = useState({});
  const [loadingSchemas, setLoadingSchemas] = useState(new Set());

  useEffect(() => {
    // Load servers immediately from cache
    loadServers();

    // Listen for schema updates from background refresh
    const unlistenPromise = listen("schema_updated", (event) => {
      const { serverId, schemas } = event.payload;
      setSchemasByServer((prev) => ({
        ...prev,
        [serverId]: schemas,
      }));
    });

    return () => {
      unlistenPromise.then((fn) => fn());
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

  const handleServerSelect = useCallback((server) => {
    setSelectedServer(server);
  }, []);

  const handleServerExpand = useCallback(
    async (serverId, isExpanding) => {
      if (!isExpanding) {
        // Collapsing - optionally clear cached data to free memory
        // setSchemasByServer(prev => {
        //   const newSchemas = { ...prev };
        //   delete newSchemas[serverId];
        //   return newSchemas;
        // });
        return;
      }

      // Only load if not already cached
      if (schemasByServer[serverId]) {
        return;
      }

      setLoadingSchemas((prev) => new Set(prev).add(serverId));

      try {
        const schemaList = await invoke("get_schema_tree", { serverId });
        setSchemasByServer((prev) => ({
          ...prev,
          [serverId]: schemaList,
        }));

        // Check if schema is stale (older than 1 hour)
        const now = Date.now() / 1000;
        const isStale =
          schemaList.length === 0 ||
          schemaList.some((s) => now - s.last_updated > 3600);

        if (isStale) {
          // Trigger background refresh (fire and forget)
          invoke("refresh_schema", { serverId }).catch((err) => {
            console.error("Schema refresh failed:", err);
          });
        }
      } catch (error) {
        console.error("Failed to load schemas:", error);
      } finally {
        setLoadingSchemas((prev) => {
          const newSet = new Set(prev);
          newSet.delete(serverId);
          return newSet;
        });
      }
    },
    [schemasByServer]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <LeftPanel
          servers={servers}
          schemasByServer={schemasByServer}
          loadingSchemas={loadingSchemas}
          onServerSelect={handleServerSelect}
          onServerExpand={handleServerExpand}
          selectedServer={selectedServer}
        />
        <RightPanel selectedServer={selectedServer} />
      </Box>
    </ThemeProvider>
  );
}

export default App;
