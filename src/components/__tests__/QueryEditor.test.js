import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import QueryEditor from "../QueryEditor";

vi.mock("@uiw/react-codemirror", () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <textarea
      data-testid="cm-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

describe("QueryEditor", () => {
  it("executes SQL from the editor", async () => {
    const onExecute = vi.fn().mockResolvedValue();
    const user = userEvent.setup();
    render(
      <QueryEditor serverId="server-1" serverName="Local" onExecute={onExecute} />,
    );

    const editor = screen.getByTestId("cm-editor");
    fireEvent.change(editor, { target: { value: "SELECT 1\nSELECT 2" } });

    expect(screen.getByText("(2 lines)")).toBeInTheDocument();

    const executeButton = screen.getByRole("button", { name: /execute query/i });
    expect(executeButton).toBeEnabled();

    await user.click(executeButton);
    expect(onExecute).toHaveBeenCalledWith("SELECT 1\nSELECT 2");
  });

  it("clears the editor content", async () => {
    const onClear = vi.fn();
    const { container } = render(
      <QueryEditor
        serverId="server-1"
        serverName="Local"
        onExecute={vi.fn()}
        onClear={onClear}
      />,
    );

    const editor = screen.getAllByTestId("cm-editor")[0];
    fireEvent.change(editor, { target: { value: "SELECT 1" } });

    const clearIcon = container.querySelector('[data-testid="ClearIcon"]');
    fireEvent.click(clearIcon.closest("button"));

    expect(onClear).toHaveBeenCalled();
    expect(screen.getAllByTestId("cm-editor")[0]).toHaveValue("");
  });
});
