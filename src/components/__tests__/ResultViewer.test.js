import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ResultViewer from "../ResultViewer";

describe("ResultViewer", () => {
  it("shows loading state", () => {
    render(<ResultViewer isLoading />);
    expect(screen.getByText(/executing query/i)).toBeInTheDocument();
  });

  it("renders error state with details", () => {
    render(
      <ResultViewer error="Error executing query:\nSELECT 1\n\nSyntax error" />,
    );
    expect(screen.getByText(/query error/i)).toBeInTheDocument();
    expect(screen.getByText(/syntax error/i)).toBeInTheDocument();
    expect(screen.getByText(/select 1/i)).toBeInTheDocument();
  });

  it("renders results, filters rows, and copies cell values", async () => {
    const results = {
      columns: [
        { name: "id", type: "int" },
        { name: "name", type: "text" },
      ],
      rows: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    };

    render(<ResultViewer results={results} />);

    expect(screen.getByText("Results")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search results...");
    fireEvent.change(searchInput, { target: { value: "Bob" } });

    await waitFor(() => {
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });

    const bobCell = screen.getByText("Bob");
    fireEvent.click(bobCell);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Bob");
    expect(screen.getByText(/filtered from 2/i)).toBeInTheDocument();
  });

  it("shows empty state when no results are present", () => {
    render(<ResultViewer results={null} />);
    expect(
      screen.getByText(/execute a query to see results/i),
    ).toBeInTheDocument();
  });

  it("shows rows affected summary", () => {
    render(
      <ResultViewer
        results={{ columns: [], rows: [] }}
        rowsAffected={3}
        executionTime={15}
      />,
    );

    expect(screen.getByText(/3 rows affected/i)).toBeInTheDocument();
    expect(screen.getByText(/completed in 15 ms/i)).toBeInTheDocument();
  });
});
