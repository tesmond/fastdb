import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import QueryHistory, {
  formatRelativeTime,
  truncateSql,
  highlightMatch,
} from "../QueryHistory";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("QueryHistory helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats relative time for recent timestamps", () => {
    const now = Date.now() / 1000;
    expect(formatRelativeTime(now - 30)).toBe("Just now");
    expect(formatRelativeTime(now - 120)).toBe("2 minutes ago");
    expect(formatRelativeTime(now - 3600)).toBe("1 hour ago");
    expect(formatRelativeTime(now - 90000)).toBe("Yesterday");
    expect(formatRelativeTime(now - 3 * 86400)).toBe("3 days ago");
  });

  it("truncates sql with ellipsis", () => {
    const sql = "SELECT 1\nFROM users\nWHERE active = true";
    expect(truncateSql(sql)).toBe("SELECT 1 FROM users WHERE active = true");
    expect(truncateSql(sql, 10)).toBe("SELECT 1 F...");
  });

  it("highlights matches when search term is present", () => {
    const { container } = render(
      <span>{highlightMatch("SELECT * FROM users", "select")}</span>,
    );
    const mark = container.querySelector("mark");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveTextContent("SELECT");
  });
});

describe("QueryHistory component", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("loads history and allows keyboard selection", async () => {
    const history = [
      {
        id: 1,
        sql: "SELECT 1",
        last_executed_at: Date.now() / 1000 - 120,
        execution_count: 1,
      },
    ];
    invoke.mockResolvedValueOnce(history);

    const onSelectQuery = vi.fn();
    const { container } = render(
      <QueryHistory serverId="server-1" onSelectQuery={onSelectQuery} />,
    );

    await screen.findByText(/select 1/i);
    const root = container.firstChild;

    fireEvent.keyDown(root, { key: "ArrowDown" });
    fireEvent.keyDown(root, { key: "Enter" });

    expect(onSelectQuery).toHaveBeenCalledWith("SELECT 1");
  });

  it("searches history when typing", async () => {
    invoke
      .mockResolvedValueOnce([
        {
          id: 1,
          sql: "SELECT 1",
          last_executed_at: Date.now() / 1000 - 120,
          execution_count: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2,
          sql: "SELECT * FROM orders",
          last_executed_at: Date.now() / 1000 - 200,
          execution_count: 1,
        },
      ]);

    render(<QueryHistory serverId="server-1" />);

    await screen.findByText(/select 1/i);

    const user = userEvent.setup();
    const input = screen.getAllByPlaceholderText("Search queries...")[0];
    await user.type(input, "orders");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "search_query_history",
        expect.objectContaining({
          serverId: "server-1",
          searchTerm: "orders",
          limit: 500,
        }),
      ),
    );
  });

  it("deletes a history entry", async () => {
    const history = [
      {
        id: 1,
        sql: "SELECT 1",
        last_executed_at: Date.now() / 1000 - 120,
        execution_count: 1,
      },
    ];
    invoke.mockResolvedValueOnce(history);
    invoke.mockResolvedValueOnce(true);

    const { container } = render(<QueryHistory serverId="server-1" />);

    await screen.findByText(/select 1/i);
    const deleteIcon = screen.getByTestId("DeleteIcon");
    fireEvent.click(deleteIcon.closest("button"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_query_history_entry", {
        entryId: 1,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText(/select 1/i)).toBeNull();
    });
  });
});
